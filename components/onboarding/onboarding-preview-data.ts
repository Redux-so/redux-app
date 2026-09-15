import { DEFAULT_LIBRARY_FILTERS } from "@/lib/library-filters";
import { DEFAULT_LIBRARY_SIDEBAR_VIEW } from "@/constants/library-quick-filters";
import type { AlbumRecord } from "@/types/album";
import type { ImageGroup, ImageRecord } from "@/types/image";

export const ONBOARDING_SAMPLE_IMAGE_URL = "/sign-in-hero.jpg";

export const ONBOARDING_SAMPLE_IMAGE: ImageRecord = {
  id: "onboarding-sample-image",
  filename: "photo.jpg",
  originalUrl: ONBOARDING_SAMPLE_IMAGE_URL,
  previewUrl: null,
  publicId: "onboarding-sample",
  utKey: null,
  width: 1600,
  height: 1067,
  size: 2_400_000,
  format: "jpeg",
  createdAt: new Date().toISOString(),
  userId: "onboarding",
  isFavorite: false,
};

export const ONBOARDING_PREVIEW_ALBUMS: AlbumRecord[] = [
  {
    id: "onboarding-album-1",
    name: "Client work",
    createdAt: new Date().toISOString(),
    imageIds: [],
  },
  {
    id: "onboarding-album-2",
    name: "Travel",
    createdAt: new Date().toISOString(),
    imageIds: [],
  },
];

export const ONBOARDING_LIBRARY_GROUPS: ImageGroup[] = [
  {
    label: "RECENT",
    images: [ONBOARDING_SAMPLE_IMAGE],
  },
];

export const ONBOARDING_LIBRARY_FILTERS = DEFAULT_LIBRARY_FILTERS;
export const ONBOARDING_LIBRARY_SIDEBAR_VIEW = DEFAULT_LIBRARY_SIDEBAR_VIEW;
