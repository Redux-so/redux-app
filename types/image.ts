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
}

export interface ImageGroup {
  label: string;
  images: ImageRecord[];
}
