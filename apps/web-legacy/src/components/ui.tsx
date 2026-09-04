// Shared UI primitives: chips, panels, sparklines, drawer, toast.

import React, { useEffect, useState } from "react";

/** Inline guidance telling the user where to click / how to read the screen. */
export function Tip({ children }: { children: React.ReactNode }) {
  return (
    <div className="tip">
      <span className="tip-ico">◆</span>
      <span>{children}</span>
    </div>
  );
}

export function StateChip({ state }: { state: string }) {
  const cls = state.replace(/\s/g, "");
  return <span className={`chip ${cls}`}>{state}</span>;
}

export function Pri({ p }: { p: string }) {
  return <span className={`pri ${p}`}>{p}</span>;
}

export function Panel({
  title, action, children, style,
}: {
  title?: React.ReactNode; action?: React.ReactNode;
  children: React.ReactNode; style?: React.CSSProperties;
}) {
  return (
    <div className="panel" style={style}>
      {title !== undefined && (
        <div className="panel-title">
          <span>{title}</span>
          {action}
        </div>
      )}
      {children}
    </div>
  );
}

export function Spark({ values, height = 42 }: { values: number[]; height?: number }) {
  const max = Math.max(...values, 0.0001);
  const min = Math.min(...values);
  const range = max - min || 1;
  return (
    <div className="spark" style={{ height }}>
      {values.map((v, i) => (
        <div
          key={i}
          className={`bar ${i === values.length - 1 ? "hot" : ""}`}
          style={{ height: `${12 + ((v - min) / range) * 88}%` }}
          title={String(v)}
        />
      ))}
    </div>
  );
}

export function HBar({
  label, value, max, display,
}: { label: string; value: number; max: number; display?: string }) {
  return (
    <div className="hbar-row">
      <div className="hbar-label" title={label}>{label}</div>
      <div className="hbar-track">
        <div className="hbar-fill" style={{ width: `${Math.min(100, (value / max) * 100)}%` }} />
      </div>
      <div className="hbar-value">{display ?? value}</div>
    </div>
  );
}

export function Drawer({ onClose, children }: { onClose: () => void; children: React.ReactNode }) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);
  return (
    <div className="drawer-backdrop" onClick={onClose} role="presentation">
      <aside
        className="drawer"
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          className="drawer-close"
          onClick={(e) => { e.stopPropagation(); onClose(); }}
          aria-label="Close"
        >
          ×
        </button>
        {children}
      </aside>
    </div>
  );
}

export function Modal({
  title, subtitle, onClose, children, footer, wide, xl,
}: {
  title: string; subtitle?: string; onClose: () => void;
  children: React.ReactNode; footer?: React.ReactNode; wide?: boolean; xl?: boolean;
}) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className={`modal ${wide ? "wide" : ""} ${xl ? "xl" : ""}`}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <div className="modal-head">
          <div>
            <h2 className="modal-title">{title}</h2>
            {subtitle && <p className="modal-sub">{subtitle}</p>}
          </div>
          <button className="drawer-close" onClick={onClose} aria-label="Close">×</button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>
  );
}

export function Field({
  label, required, hint, children,
}: {
  label: string; required?: boolean; hint?: string; children: React.ReactNode;
}) {
  return (
    <label className="field-wrap">
      <span className="field-label">
        {label}{required && <em>*</em>}
      </span>
      {children}
      {hint && <span className="field-hint">{hint}</span>}
    </label>
  );
}

export function PageHeader({
  title, sub, actions, tip,
}: {
  title: string; sub?: string; actions?: React.ReactNode; tip?: React.ReactNode;
}) {
  return (
    <div className="page-head">
      <div className="row between wrap" style={{ gap: 12, alignItems: "flex-start" }}>
        <div>
          <h1 className="page-title">{title}</h1>
          {sub && <p className="page-sub">{sub}</p>}
        </div>
        {actions && <div className="page-actions">{actions}</div>}
      </div>
      {tip && <Tip>{tip}</Tip>}
    </div>
  );
}

let toastListener: ((msg: string) => void) | null = null;

export function toast(msg: string) {
  toastListener?.(msg);
}

export function ToastHost() {
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => {
    toastListener = (m) => {
      setMsg(m);
      setTimeout(() => setMsg(null), 3200);
    };
    return () => { toastListener = null; };
  }, []);
  if (!msg) return null;
  return <div className="toast">{msg}</div>;
}

/** Mock evidence frame with a defect overlay box. */
export function EvidenceFrame({
  label, defect,
}: { label: string; defect?: boolean }) {
  return (
    <div className="evidence-frame">
      <span className="label">{label}</span>
      <svg width="70%" height="70%" viewBox="0 0 200 150" style={{ opacity: 0.75 }}>
        <rect x="20" y="30" width="160" height="90" rx="8" fill="none" stroke="#3a4a5c" strokeWidth="2" />
        <line x1="20" y1="60" x2="180" y2="60" stroke="#2a3542" strokeWidth="1.5" />
        <line x1="20" y1="90" x2="180" y2="90" stroke="#2a3542" strokeWidth="1.5" />
        <circle cx="55" cy="75" r="10" fill="none" stroke="#3a4a5c" strokeWidth="2" />
        <circle cx="145" cy="75" r="10" fill="none" stroke="#3a4a5c" strokeWidth="2" />
        {defect && <path d="M95 55 L110 78 L92 92" fill="none" stroke="#e74c3c" strokeWidth="2.5" />}
      </svg>
      {defect && <div className="overlay-box" style={{ left: "42%", top: "32%", width: "18%", height: "34%" }} />}
    </div>
  );
}
