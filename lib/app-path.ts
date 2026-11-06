// Next.js adds this prefix for its own navigation. Use this helper for raw URLs.
export const APP_BASE_PATH = process.env.NEXT_PUBLIC_APP_BASE_PATH === "/app" ? "/app" : "";

export function appPath(path: string): string {
  return `${APP_BASE_PATH}${path}`;
}
