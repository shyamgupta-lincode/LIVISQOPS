import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

import type { CopilotPageContext } from "./types";

type CopilotCtxValue = {
  page: CopilotPageContext | null;
  setPageContext: (next: CopilotPageContext | null) => void;
  patchPageContext: (partial: Partial<CopilotPageContext>) => void;
};

const CopilotCtx = createContext<CopilotCtxValue | null>(null);

export function CopilotProvider({ children }: { children: React.ReactNode }) {
  const [page, setPage] = useState<CopilotPageContext | null>(null);

  const setPageContext = useCallback((next: CopilotPageContext | null) => {
    setPage(next);
  }, []);

  const patchPageContext = useCallback((partial: Partial<CopilotPageContext>) => {
    setPage((prev) => ({ ...(prev || {}), ...partial }));
  }, []);

  const value = useMemo(
    () => ({ page, setPageContext, patchPageContext }),
    [page, setPageContext, patchPageContext],
  );

  return <CopilotCtx.Provider value={value}>{children}</CopilotCtx.Provider>;
}

export function useCopilot(): CopilotCtxValue {
  const ctx = useContext(CopilotCtx);
  if (!ctx) {
    return {
      page: null,
      setPageContext: () => undefined,
      patchPageContext: () => undefined,
    };
  }
  return ctx;
}

/**
 * Register Explore / host page context while mounted; clears on unmount.
 * Pass a stable-ish object — updates when deps change.
 */
export function useCopilotPageBridge(ctx: CopilotPageContext | null) {
  const { setPageContext } = useCopilot();

  useEffect(() => {
    if (!ctx) {
      setPageContext(null);
      return;
    }
    setPageContext(ctx);
    return () => setPageContext(null);
    // Intentionally re-bind when key fields change
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    setPageContext,
    ctx?.focusLabel,
    ctx?.layout,
    ctx?.metrics?.coveragePct,
    ctx?.metrics?.linkedObjects,
    ctx?.metrics?.engagement,
    ctx?.metrics?.implementPct,
    ctx?.metrics?.alertCount,
    ctx?.bindings,
    ctx?.onOverview,
    ctx?.onCinema,
    ctx?.onRiAnalysis,
  ]);
}
