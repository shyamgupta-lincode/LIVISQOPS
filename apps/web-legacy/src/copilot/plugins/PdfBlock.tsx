import React, { useMemo, useState } from "react";

import type { PdfPayload } from "../types";

export function PdfBlock({ payload }: { payload: PdfPayload }) {
  const [page, setPage] = useState(Math.max(1, payload.page ?? 1));
  const [showMd, setShowMd] = useState(Boolean(payload.markdownPreview) && !payload.url);

  const src = useMemo(() => {
    const base = payload.url;
    // PDF.js-style page fragment works in Chrome/Edge PDF viewer
    return `${base}#page=${page}`;
  }, [payload.url, page]);

  return (
    <div className="copilot-block copilot-block-pdf">
      <div className="copilot-block-head">
        <div className="copilot-block-title">{payload.title}</div>
        <div className="copilot-pdf-tools">
          {payload.markdownUrl && (
            <button
              type="button"
              className={`copilot-mini ${showMd ? "on" : ""}`}
              onClick={() => setShowMd((v) => !v)}
            >
              MD
            </button>
          )}
          <button
            type="button"
            className="copilot-mini"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            aria-label="Previous page"
          >
            ‹
          </button>
          <span className="copilot-pdf-page">p.{page}</span>
          <button
            type="button"
            className="copilot-mini"
            onClick={() => setPage((p) => p + 1)}
            aria-label="Next page"
          >
            ›
          </button>
          <a className="copilot-mini link" href={payload.url} target="_blank" rel="noreferrer">
            ↗
          </a>
        </div>
      </div>

      {showMd && payload.markdownPreview ? (
        <pre className="copilot-md-preview">{payload.markdownPreview}</pre>
      ) : (
        <div className="copilot-pdf-frame">
          <object data={src} type="application/pdf" title={payload.title} className="copilot-pdf-object">
            <iframe title={payload.title} src={src} className="copilot-pdf-iframe" />
          </object>
        </div>
      )}

      {payload.markdownUrl && !showMd && (
        <button type="button" className="copilot-md-toggle" onClick={() => setShowMd(true)}>
          Show markdown excerpt from manual
        </button>
      )}
    </div>
  );
}
