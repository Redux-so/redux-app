"use client";

import * as Dialog from "@radix-ui/react-dialog";
import type { ReactNode } from "react";
import { Icon } from "@/components/shared/Icon";

export default function MobileLibraryNavigation({ open, onOpenChange, children }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: ReactNode;
}) {
  return (
    // The page behind the drawer is inert. Non-modal mode also lets nested
    // account dialogs use their existing body portals without trapping focus.
    <Dialog.Root open={open} onOpenChange={onOpenChange} modal={false}>
      <div className="mt-2 flex h-12 shrink-0 items-center px-3 lg:hidden">
        <Dialog.Trigger asChild>
          <button type="button" aria-label="Open library navigation" className="flex h-11 w-11 items-center justify-center rounded-md text-white hover:bg-[#1d1d1d] cursor-pointer">
            <Icon name="Menu01" size={24} />
          </button>
        </Dialog.Trigger>
      </div>
      <Dialog.Portal>
        <div className="redux-popup-backdrop fixed inset-0 z-40 bg-black/60 lg:hidden" aria-hidden onClick={() => onOpenChange(false)} />
        <Dialog.Content
          aria-modal="true"
          onInteractOutside={(event) => event.preventDefault()}
          className="redux-popup-enter mobile-library-drawer fixed inset-y-0 left-0 z-50 w-[260px] max-w-[calc(100vw-48px)] outline-none lg:hidden"
        >
          <Dialog.Title className="sr-only">Library navigation</Dialog.Title>
          <Dialog.Description className="sr-only">Browse your library, albums, and account.</Dialog.Description>
          <Dialog.Close asChild>
            <button type="button" aria-label="Close library navigation" className="absolute right-3 top-5 z-10 flex h-9 w-9 items-center justify-center rounded-md text-[#888888] hover:bg-[#1d1d1d] hover:text-white cursor-pointer">
              <Icon name="XClose" size={20} />
            </button>
          </Dialog.Close>
          {children}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
