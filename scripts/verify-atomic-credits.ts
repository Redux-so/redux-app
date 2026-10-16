/**
 * SEC-03 atomic credit helpers — no auth, DB, or production balances.
 * Run: pnpm exec tsx scripts/verify-atomic-credits.ts
 */
import assert from "node:assert/strict";
import type { Prisma } from "@prisma/client";
import { CREDIT_COSTS } from "../constants/credits";
import {
  deductCreditsAtomicInTx,
  refundCreditsAtomicInTx,
} from "../lib/atomic-credits";

type TransactionClient = Prisma.TransactionClient;

function createMockTx(initialBalance: number, userId = "user_test") {
  let balance = initialBalance;
  const ledger: Array<{ type: string; amount: number; feature: string }> = [];
  let txQueue: Promise<unknown> = Promise.resolve();

  const tx = {
    user: {
      updateMany: async ({
        where,
        data,
      }: {
        where: { id: string; creditBalance: { gte: number } };
        data: { creditBalance: { decrement: number } };
      }) => {
        const run = txQueue.then(() => {
          assert.equal(where.id, userId);
          const amount = data.creditBalance.decrement;
          if (balance >= where.creditBalance.gte && balance >= amount) {
            balance -= amount;
            return { count: 1 };
          }
          return { count: 0 };
        });
        txQueue = run;
        return run;
      },
      update: async ({
        where,
        data,
      }: {
        where: { id: string };
        data: { creditBalance: { increment: number } };
        select: { creditBalance: true };
      }) => {
        assert.equal(where.id, userId);
        balance += data.creditBalance.increment;
        return { creditBalance: balance };
      },
      findUniqueOrThrow: async () => ({ creditBalance: balance }),
    },
    creditTransaction: {
      create: async ({
        data,
      }: {
        data: {
          type: string;
          amount: number;
          feature: string;
          description?: string;
        };
      }) => {
        ledger.push({
          type: data.type,
          amount: data.amount,
          feature: data.feature,
        });
      },
    },
  };

  return {
    tx: tx as unknown as TransactionClient,
    getBalance: () => balance,
    getLedger: () => ledger,
  };
}

async function testInsufficientCredits() {
  const { tx, getBalance, getLedger } = createMockTx(0);
  const result = await deductCreditsAtomicInTx(tx, {
    userId: "user_test",
    amount: CREDIT_COSTS.auto_enhance,
    feature: "auto_enhance",
  });
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.reason, "insufficient");
  }
  assert.equal(getBalance(), 0);
  assert.equal(getLedger().length, 0);
}

async function testSuccessfulCharge() {
  const { tx, getBalance, getLedger } = createMockTx(5);
  const amount = CREDIT_COSTS.style_match;
  const result = await deductCreditsAtomicInTx(tx, {
    userId: "user_test",
    amount,
    feature: "style_match",
  });
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.balanceAfter, 5 - amount);
  }
  assert.equal(getBalance(), 5 - amount);
  assert.equal(getLedger().length, 1);
  assert.equal(getLedger()[0]?.type, "DEDUCTION");
  assert.equal(getLedger()[0]?.amount, -amount);
}

async function testConcurrentOverspend() {
  const { tx, getBalance, getLedger } = createMockTx(1);
  const amount = 1;
  const [a, b] = await Promise.all([
    deductCreditsAtomicInTx(tx, {
      userId: "user_test",
      amount,
      feature: "auto_enhance",
    }),
    deductCreditsAtomicInTx(tx, {
      userId: "user_test",
      amount,
      feature: "auto_enhance",
    }),
  ]);
  const successes = [a, b].filter((r) => r.ok).length;
  assert.equal(successes, 1, "only one concurrent deduct should succeed");
  assert.equal(getBalance(), 0);
  assert.equal(getLedger().length, 1);
}

async function testRefundAfterCharge() {
  const mock = createMockTx(CREDIT_COSTS.heal);
  const charge = await deductCreditsAtomicInTx(mock.tx, {
    userId: "user_test",
    amount: CREDIT_COSTS.heal,
    feature: "heal",
  });
  assert.equal(charge.ok, true);
  assert.equal(mock.getBalance(), 0);

  const refunded = await refundCreditsAtomicInTx(mock.tx, {
    userId: "user_test",
    amount: CREDIT_COSTS.heal,
    feature: "heal",
    description: "Refund: test",
  });
  assert.equal(refunded.balanceAfter, CREDIT_COSTS.heal);
  assert.equal(mock.getBalance(), CREDIT_COSTS.heal);
  assert.equal(mock.getLedger().length, 2);
  assert.equal(mock.getLedger()[1]?.type, "REFUND");
  assert.equal(mock.getLedger()[1]?.amount, CREDIT_COSTS.heal);
}

async function main() {
  await testInsufficientCredits();
  await testSuccessfulCharge();
  await testConcurrentOverspend();
  await testRefundAfterCharge();
  console.log("verify-atomic-credits: all checks passed");
}

void main();
