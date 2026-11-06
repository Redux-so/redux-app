export function creditPurchasesEnabled(): boolean {
  return process.env.CREDIT_PURCHASES_ENABLED === "true";
}
