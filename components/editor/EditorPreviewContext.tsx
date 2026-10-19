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
import { renderEditorPayload } from "@/lib/interactive-image-preview";
import {
  buildPreviewRequestBody,
  type PreviewPayload,
} from "@/lib/preview-request";

interface EditorPreviewContextValue {
  imageId?: string;
  savePreview: () => Promise<string | null>;
  saveEditorState: () => Promise<void>;
  isSavingPreview: boolean;
  isSavingEditorState: boolean;
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
  saveEditorStateRef?: MutableRefObject<(() => Promise<void>) | null>;
  children: ReactNode;
}

export function EditorPreviewProvider({
  imageId,
  getPayload,
  savePreviewRef,
  saveEditorStateRef,
  children,
}: EditorPreviewProviderProps) {
  const [isSavingPreview, setIsSavingPreview] = useState(false);
  const [isSavingEditorState, setIsSavingEditorState] = useState(false);
  const previewQueueRef = useRef<Promise<unknown>>(Promise.resolve());
  const getPayloadRef = useRef(getPayload);
  getPayloadRef.current = getPayload;

  const savePreview = useCallback(async (): Promise<string | null> => {
    if (!imageId) return null;
    const payload = getPayloadRef.current();
    const save = async () => {
      setIsSavingPreview(true);
      try {
        const body = buildPreviewRequestBody(await renderEditorPayload(payload));
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
    };
    const pending = previewQueueRef.current.then(save, save);
    previewQueueRef.current = pending;
    return pending;
  }, [imageId]);

  useEffect(() => {
    if (!savePreviewRef) return;
    savePreviewRef.current = savePreview;
    return () => {
      savePreviewRef.current = null;
    };
  }, [savePreview, savePreviewRef]);

  const saveEditorState = useCallback(async (): Promise<void> => {
    if (!saveEditorStateRef?.current) return;
    setIsSavingEditorState(true);
    try {
      await saveEditorStateRef.current();
    } finally {
      setIsSavingEditorState(false);
    }
  }, [saveEditorStateRef]);

  const value = useMemo(
    () => ({
      imageId,
      savePreview,
      saveEditorState,
      isSavingPreview,
      isSavingEditorState,
    }),
    [imageId, savePreview, saveEditorState, isSavingPreview, isSavingEditorState],
  );

  return (
    <EditorPreviewContext.Provider value={value}>
      {children}
    </EditorPreviewContext.Provider>
  );
}
