import { auth } from "@clerk/nextjs/server";
import LibraryPageClient from "./LibraryPageClient";
import { LIBRARY_PAGE_SIZE } from "@/constants/library-pagination";
import { listUserImages } from "@/lib/list-user-images";
import { getPrismaUserForClerkId } from "@/lib/require-user";

export default async function LibraryPage() {
  const { userId } = await auth();
  if (!userId) {
    throw new Error("Library page requires an authenticated session");
  }

  const user = await getPrismaUserForClerkId(userId);

  const [initialLibrary, initialTrash] = await Promise.all([
    listUserImages({
      userId: user.id,
      trash: false,
      page: 1,
      limit: LIBRARY_PAGE_SIZE,
    }),
    listUserImages({
      userId: user.id,
      trash: true,
      page: 1,
      limit: LIBRARY_PAGE_SIZE,
    }),
  ]);

  return (
    <LibraryPageClient
      key={user.id}
      ownerId={user.id}
      initialLibrary={{
        images: initialLibrary.images,
        total: initialLibrary.total,
      }}
      initialTrash={{
        images: initialTrash.images,
        total: initialTrash.total,
      }}
    />
  );
}
