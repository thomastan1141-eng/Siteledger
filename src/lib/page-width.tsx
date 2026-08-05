"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

/**
 * Content width modes for the staff/client shell `<main>`. Values map to
 * `--site-max-*` tokens in progress.css. Default is "normal" — pages must
 * opt into "wide"/"data"/"narrow" explicitly via `usePageWidth`.
 */
export type PageWidthMode = "normal" | "wide" | "data" | "narrow";

const PageWidthContext = createContext<{
  mode: PageWidthMode;
  setMode: (mode: PageWidthMode) => void;
} | null>(null);

export function PageWidthProvider({ children }: { children: ReactNode }) {
  const [mode, setMode] = useState<PageWidthMode>("normal");
  const value = useMemo(() => ({ mode, setMode }), [mode]);
  return (
    <PageWidthContext.Provider value={value}>
      {children}
    </PageWidthContext.Provider>
  );
}

/** Reads the active width mode — used by the shell's `<main>` element. */
export function usePageWidthMode(): PageWidthMode {
  const ctx = useContext(PageWidthContext);
  return ctx?.mode ?? "normal";
}

/**
 * Call once per page to opt the shared `<main>` into a non-default content
 * width (e.g. "wide" for Schedule/Timeline, "data" for Purchases). Resets to
 * "normal" on unmount so the next page isn't left in a wide state. Safe to
 * pass a value that changes between renders (e.g. a tab key).
 */
export function usePageWidth(mode: PageWidthMode) {
  const ctx = useContext(PageWidthContext);
  useEffect(() => {
    if (!ctx) return;
    // Sync the shared shell width to this page's declared mode.
    ctx.setMode(mode);
    return () => ctx.setMode("normal");
    // eslint-disable-next-line react-hooks/exhaustive-deps -- ctx is stable per provider
  }, [mode]);
}
