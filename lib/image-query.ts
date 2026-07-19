/** Active library images — not in trash. */
export const ACTIVE_IMAGE_WHERE = { deletedAt: null } as const;

/** Trashed images only. */
export const TRASHED_IMAGE_WHERE = { deletedAt: { not: null } } as const;
