"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type MutableRefObject,
  type ReactNode,
} from "react";

interface EditorPreviewContextValue {
  imageId?: string;
  saveEditorState: () => Promise<void>;
  isSavingEditorState: boolean;
}

const EditorPreviewContext = createContext<EditorPreviewContextValue | null>(null);

export function useEditorPreview() {
  return useContext(EditorPreviewContext);
}

interface EditorPreviewProviderProps {
  imageId?: string;
  saveEditorStateRef: MutableRefObject<(() => Promise<void>) | null>;
  children: ReactNode;
}

export function EditorPreviewProvider({
  imageId,
  saveEditorStateRef,
  children,
}: EditorPreviewProviderProps) {
  const [isSavingEditorState, setIsSavingEditorState] = useState(false);
  const saveEditorState = useCallback(async () => {
    if (!saveEditorStateRef.current) throw new Error("The editor is still loading.");
    setIsSavingEditorState(true);
    try {
      await saveEditorStateRef.current();
    } finally {
      setIsSavingEditorState(false);
    }
  }, [saveEditorStateRef]);
  const value = useMemo(() => ({ imageId, saveEditorState, isSavingEditorState }),
    [imageId, saveEditorState, isSavingEditorState]);
  return <EditorPreviewContext.Provider value={value}>{children}</EditorPreviewContext.Provider>;
}
