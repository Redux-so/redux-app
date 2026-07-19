export interface ImageRecord {
  id: string;
  filename: string;
  originalUrl: string;
  previewUrl?: string | null;
  publicId: string;
  utKey: string | null;
  width: number;
  height: number;
  size: number;
  format: string;
  createdAt: string;
  userId: string;
  /** True when the latest saved version has non-default adjustments. */
  isEdited?: boolean;
  /** Persisted in Image.metadata.favorite. */
  isFavorite?: boolean;
}

export interface ImageGroup {
  label: string;
  images: ImageRecord[];
}
