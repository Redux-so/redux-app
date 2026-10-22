/** Serializable save failures are separate from skipped or superseded saves. */
export class EditorSaveError extends Error {
  constructor(message: string, readonly status: number, readonly retryable: boolean, readonly code?: string) {
    super(message);
    this.name = "EditorSaveError";
  }
}

export async function saveResponseError(response: Response): Promise<EditorSaveError> {
  let body: { error?: string; code?: string; retryable?: boolean } = {};
  try { body = await response.json(); } catch { /* HTML/network proxies may return no JSON. */ }
  const retryable = body.retryable ?? ![400, 401, 403, 404, 413, 422].includes(response.status);
  return new EditorSaveError(body.error ?? `Could not save your edits (HTTP ${response.status}).`, response.status, retryable, body.code);
}

// No document pixels are held here. Clear on hydration; manual saves may retry.
const failures = new Map<string, { revision: number; error: Error; retryable: boolean }>();
export function recordEditorSaveFailure(owner: string, revision: number, error: unknown) {
  if (failures.size >= 100) failures.delete(failures.keys().next().value!);
  failures.set(owner, { revision, error: error instanceof Error ? error : new Error("Could not save your edits."),
    retryable: !(error instanceof EditorSaveError) || error.retryable });
}
export function getEditorSaveFailure(owner: string, revision: number) {
  const failure = failures.get(owner);
  return failure?.revision === revision ? failure : undefined;
}
export function clearEditorSaveFailure(owner: string) { failures.delete(owner); }
