"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MutableRefObject,
  type ReactNode,
} from "react";
import {
  buildPreviewRequestBody,
  type PreviewPayload,
} from "@/lib/preview-request";

interface EditorPreviewContextValue {
  imageId?: string;
  savePreview: () => Promise<string | null>;
  isSavingPreview: boolean;
}

const EditorPreviewContext = createContext<EditorPreviewContextValue | null>(
  null,
);

export function useEditorPreview() {
  return useContext(EditorPreviewContext);
}

interface EditorPreviewProviderProps {
  imageId?: string;
  getPayload: () => PreviewPayload;
  savePreviewRef?: MutableRefObject<(() => Promise<string | null>) | null>;
  children: ReactNode;
}

export function EditorPreviewProvider({
  imageId,
  getPayload,
  savePreviewRef,
  children,
}: EditorPreviewProviderProps) {
  const [isSavingPreview, setIsSavingPreview] = useState(false);
  const getPayloadRef = useRef(getPayload);
  getPayloadRef.current = getPayload;

  const savePreview = useCallback(async (): Promise<string | null> => {
    if (!imageId) return null;
    setIsSavingPreview(true);
    try {
      const body = buildPreviewRequestBody(getPayloadRef.current());
      const res = await fetch(`/api/images/${imageId}/generate-preview`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        console.error("[EditorPreview] generate-preview failed:", res.status);
        return null;
      }
      const data = (await res.json()) as { previewUrl?: string };
      return data.previewUrl ?? null;
    } catch (err) {
      console.error("[EditorPreview] generate-preview error:", err);
      return null;
    } finally {
      setIsSavingPreview(false);
    }
  }, [imageId]);

  useEffect(() => {
    if (!savePreviewRef) return;
    savePreviewRef.current = savePreview;
    return () => {
      savePreviewRef.current = null;
    };
  }, [savePreview, savePreviewRef]);

  const value = useMemo(
    () => ({
      imageId,
      savePreview,
      isSavingPreview,
    }),
    [imageId, savePreview, isSavingPreview],
  );

  return (
    <EditorPreviewContext.Provider value={value}>
      {children}
    </EditorPreviewContext.Provider>
  );
}
