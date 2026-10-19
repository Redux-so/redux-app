/** Await logical edits, including edits started while an earlier edit is finishing. */
export function createEditorOperations() {
  const pending = new Set<Promise<void>>();
  return {
    begin() {
      let finish!: () => void;
      const operation = new Promise<void>((resolve) => { finish = resolve; });
      pending.add(operation);
      return () => { pending.delete(operation); finish(); };
    },
    async waitForIdle() {
      while (pending.size > 0) await Promise.all([...pending]);
    },
  };
}
