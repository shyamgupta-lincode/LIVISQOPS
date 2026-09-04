import React, { useEffect, useMemo, useRef, useState } from "react";

import { useAuth } from "../auth";
import { useCopilot } from "./CopilotContext";
import {
  quickChart,
  quickDocs,
  quickTable,
  resolveCopilotIntent,
} from "./intelligence";
import { renderPluginBlock } from "./plugins/registry";
import type { AssistantReply, CopilotMessage } from "./types";

function uid() {
  return `m-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

function applyActions(reply: AssistantReply, page: ReturnType<typeof useCopilot>["page"]) {
  if (!reply.actions?.length || !page) return;
  for (const a of reply.actions) {
    if (a === "overview") page.onOverview?.();
    if (a === "cinema") page.onCinema?.();
    if (a === "ri-analysis") page.onRiAnalysis?.();
  }
}

export default function UniversalCopilot() {
  const { workspace } = useAuth();
  const { page } = useCopilot();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [showCtx, setShowCtx] = useState(false);
  const [messages, setMessages] = useState<CopilotMessage[]>(() => [
    {
      id: "welcome",
      role: "assistant",
      text:
        "Universal copilot — chart coverage, list bindings as tables, or open plant docs. " +
        "Quick actions below, or type a question.",
      ts: Date.now(),
    },
  ]);
  const listRef = useRef<HTMLDivElement>(null);

  const placeholder = useMemo(() => {
    const site = workspace?.site_label || workspace?.name;
    if (page?.focusLabel) return `Ask about ${page.focusLabel}…`;
    if (site) return `Ask about ${site}…`;
    return "Ask the copilot…";
  }, [workspace, page?.focusLabel]);

  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages, open, busy]);

  const pushAssistant = (reply: AssistantReply) => {
    applyActions(reply, page);
    setMessages((prev) => [
      ...prev,
      {
        id: uid(),
        role: "assistant",
        text: reply.text,
        blocks: reply.blocks,
        ts: Date.now(),
      },
    ]);
  };

  const runReply = async (factory: () => AssistantReply | Promise<AssistantReply>) => {
    setBusy(true);
    try {
      const reply = await factory();
      pushAssistant(reply);
    } finally {
      setBusy(false);
    }
  };

  const submit = async (raw?: string) => {
    const q = (raw ?? draft).trim();
    if (!q || busy) return;
    setDraft("");
    setOpen(true);
    setMessages((prev) => [
      ...prev,
      { id: uid(), role: "user", text: q, ts: Date.now() },
    ]);
    await runReply(() => resolveCopilotIntent(q, page));
  };

  const metrics = page?.metrics;

  return (
    <div className={`copilot-root ${open ? "is-open" : ""}`} data-tour="universal-copilot">
      {open && (
        <section className="copilot-panel fade-in" aria-label="Universal copilot">
          <header className="copilot-head">
            <div className="copilot-brand">
              <span className="copilot-mark" aria-hidden>✦</span>
              <div>
                <strong>Copilot</strong>
                <em>{workspace?.short_name || workspace?.name || "LIVIS"}</em>
              </div>
            </div>
            <div className="copilot-head-actions">
              {metrics && (
                <button
                  type="button"
                  className={`copilot-chip ghost ${showCtx ? "on" : ""}`}
                  onClick={() => setShowCtx((v) => !v)}
                  title="Context KPIs"
                >
                  Context
                </button>
              )}
              <button
                type="button"
                className="copilot-icon-btn"
                aria-label="Close copilot"
                onClick={() => setOpen(false)}
              >
                ✕
              </button>
            </div>
          </header>

          {metrics && showCtx && (
            <div className="copilot-kpi-strip fade-in">
              <div><em>{metrics.coveragePct}%</em><span>Coverage</span></div>
              <div><em>{metrics.linkedObjects}</em><span>Linked</span></div>
              <div><em>{metrics.engagement}</em><span>Engage</span></div>
              <div><em>{metrics.implementPct}%</em><span>Impl</span></div>
            </div>
          )}

          <div className="copilot-messages" ref={listRef}>
            {messages.map((m) => (
              <div key={m.id} className={`copilot-msg ${m.role}`}>
                <p>{m.text}</p>
                {m.blocks?.map((b, i) => (
                  <div key={`${m.id}-b-${i}`} className="copilot-plugin">
                    {renderPluginBlock(b)}
                  </div>
                ))}
              </div>
            ))}
            {busy && <div className="copilot-msg assistant thinking">Thinking…</div>}
          </div>

          <div className="copilot-quick">
            <button
              type="button"
              className="copilot-chip"
              disabled={!page?.onOverview && !page?.onCinema}
              onClick={() => {
                if (page?.layout === "overview") page.onCinema?.();
                else page?.onOverview?.();
              }}
            >
              {page?.layout === "overview" ? "Cinema" : "Overview"}
            </button>
            <button
              type="button"
              className="copilot-chip accent"
              disabled={!page?.onRiAnalysis}
              onClick={() => {
                page?.onRiAnalysis?.();
                pushAssistant({
                  text: `RI Analysis${metrics?.alertCount ? ` · ${metrics.alertCount} signals` : ""}.`,
                });
              }}
            >
              RI Analysis
              {!!metrics?.alertCount && metrics.alertCount > 0 && (
                <span className="copilot-badge">{metrics.alertCount}</span>
              )}
            </button>
            <button
              type="button"
              className="copilot-chip"
              onClick={() => {
                setOpen(true);
                setMessages((prev) => [
                  ...prev,
                  { id: uid(), role: "user", text: "Show coverage chart", ts: Date.now() },
                ]);
                void runReply(() => quickChart(page));
              }}
            >
              Chart
            </button>
            <button
              type="button"
              className="copilot-chip"
              onClick={() => {
                setOpen(true);
                setMessages((prev) => [
                  ...prev,
                  { id: uid(), role: "user", text: "Table of bindings", ts: Date.now() },
                ]);
                void runReply(() => quickTable(page));
              }}
            >
              Table
            </button>
            <button
              type="button"
              className="copilot-chip"
              onClick={() => {
                setOpen(true);
                setMessages((prev) => [
                  ...prev,
                  { id: uid(), role: "user", text: "Open user manual", ts: Date.now() },
                ]);
                void runReply(() => quickDocs(page));
              }}
            >
              Docs
            </button>
          </div>

          <form
            className="copilot-composer"
            onSubmit={(e) => {
              e.preventDefault();
              void submit();
            }}
          >
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder={placeholder}
              aria-label="Ask the copilot"
              disabled={busy}
            />
            <button type="submit" className="copilot-send" aria-label="Send" disabled={busy || !draft.trim()}>
              ➤
            </button>
          </form>
        </section>
      )}

      <button
        type="button"
        className={`copilot-fab ${open ? "is-hidden" : ""}`}
        aria-label="Open copilot"
        aria-expanded={open}
        onClick={() => setOpen(true)}
      >
        <span className="copilot-fab-ico" aria-hidden>✦</span>
        <span className="copilot-fab-label">Copilot</span>
      </button>
    </div>
  );
}
