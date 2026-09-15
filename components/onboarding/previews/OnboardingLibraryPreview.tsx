"use client";

import { useState } from "react";

import {
  ONBOARDING_LIBRARY_FILTERS,
  ONBOARDING_LIBRARY_GROUPS,
  ONBOARDING_LIBRARY_SIDEBAR_VIEW,
  ONBOARDING_PREVIEW_ALBUMS,
} from "@/components/onboarding/onboarding-preview-data";
import OnboardingPreviewRoot from "@/components/onboarding/previews/OnboardingPreviewRoot";
import LibraryHeader from "@/components/library/LibraryHeader";
import LibrarySidebar from "@/components/library/LibrarySidebar";
import PhotoGrid from "@/components/library/PhotoGrid";
import type { LibraryFilters, LibrarySidebarView } from "@/lib/library-filters";

export default function OnboardingLibraryPreview() {
  const [sidebarView, setSidebarView] = useState<LibrarySidebarView>(
    ONBOARDING_LIBRARY_SIDEBAR_VIEW,
  );
  const [filters, setFilters] = useState<LibraryFilters>(ONBOARDING_LIBRARY_FILTERS);

  return (
    <OnboardingPreviewRoot className="flex overflow-hidden">
      <LibrarySidebar
        sidebarView={sidebarView}
        onSidebarViewChange={setSidebarView}
        albums={ONBOARDING_PREVIEW_ALBUMS}
        onCreateAlbum={async () => false}
        onDeleteAlbum={async () => false}
      />
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-[#161616]">
        <main className="scroll-stable flex min-h-0 flex-1 flex-col overflow-hidden">
          <LibraryHeader
            isSearching={false}
            onSearchStart={() => {}}
            onSearchSuccess={() => {}}
            onSearchAbort={() => {}}
            onSearchClear={() => {}}
            filters={filters}
            onFiltersChange={setFilters}
          />
          <div className="min-h-0 flex-1 overflow-hidden">
            <PhotoGrid
              groups={ONBOARDING_LIBRARY_GROUPS}
              libraryLoading={false}
              albums={ONBOARDING_PREVIEW_ALBUMS}
              albumMembershipByImageId={new Map()}
            />
          </div>
        </main>
      </div>
    </OnboardingPreviewRoot>
  );
}
