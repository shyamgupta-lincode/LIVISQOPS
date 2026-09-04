import React from "react";

type IconProps = { color?: string; size?: number; className?: string };

function Svg({ color = "currentColor", size = 16, className, children }: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      {children}
    </svg>
  );
}

export function IconFacility(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M3 21h18" />
      <path d="M5 21V8l4-2v15" />
      <path d="M9 21V6l5-2v17" />
      <path d="M14 21V8h5v13" />
      <path d="M16.5 11h1M16.5 14h1M16.5 17h1" />
    </Svg>
  );
}

export function IconArea(p: IconProps) {
  return (
    <Svg {...p}>
      <rect x="3" y="3" width="8" height="8" rx="1.5" />
      <rect x="13" y="3" width="8" height="8" rx="1.5" />
      <rect x="3" y="13" width="8" height="8" rx="1.5" />
      <rect x="13" y="13" width="8" height="8" rx="1.5" />
    </Svg>
  );
}

export function IconFabrication(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M4 18h16" />
      <path d="M7 18V9l3-2 3 4 4-5v12" />
      <circle cx="10" cy="18" r="1.2" fill={p.color || "currentColor"} stroke="none" />
      <circle cx="17" cy="18" r="1.2" fill={p.color || "currentColor"} stroke="none" />
    </Svg>
  );
}

export function IconPaint(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M12 3c-3 4-6 6.5-6 10a6 6 0 0 0 12 0c0-3.5-3-6-6-10z" />
      <path d="M10 20h4" />
      <path d="M9 14c.8 1 2 1.5 3 1.5s2.2-.5 3-1.5" />
    </Svg>
  );
}

export function IconPowertrain(p: IconProps) {
  return (
    <Svg {...p}>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 5v2M12 17v2M5 12h2M17 12h2M7.05 7.05l1.4 1.4M15.55 15.55l1.4 1.4M7.05 16.95l1.4-1.4M15.55 8.45l1.4-1.4" />
      <circle cx="12" cy="12" r="7.5" />
    </Svg>
  );
}

export function IconAssembly(p: IconProps) {
  return (
    <Svg {...p}>
      <rect x="4" y="8" width="16" height="10" rx="1.5" />
      <path d="M8 8V6a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
      <circle cx="8.5" cy="18" r="1.5" />
      <circle cx="15.5" cy="18" r="1.5" />
      <path d="M10 12h4" />
    </Svg>
  );
}

export function IconTest(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M9 3h6" />
      <path d="M10 3v5l-4.5 9.5A2 2 0 0 0 7.3 21h9.4a2 2 0 0 0 1.8-3.5L14 8V3" />
      <path d="M9.5 14h5" />
    </Svg>
  );
}

export function IconLine(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M3 12h4l2-4 3 8 2-4h7" />
      <circle cx="5" cy="12" r="1.2" fill={p.color || "currentColor"} stroke="none" />
      <circle cx="19" cy="12" r="1.2" fill={p.color || "currentColor"} stroke="none" />
    </Svg>
  );
}

export function IconStation(p: IconProps) {
  return (
    <Svg {...p}>
      <rect x="4" y="5" width="16" height="14" rx="2" />
      <path d="M8 9h8M8 12h5M8 15h6" />
    </Svg>
  );
}

export function IconDevice(p: IconProps) {
  return (
    <Svg {...p}>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1" />
    </Svg>
  );
}

export function IconCamera(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M4 8h3l2-2h6l2 2h3v11H4V8z" />
      <circle cx="12" cy="13" r="3.5" />
    </Svg>
  );
}

export function IconEntities(p: IconProps) {
  return (
    <Svg {...p}>
      <circle cx="8" cy="8" r="2.5" />
      <circle cx="16" cy="8" r="2.5" />
      <circle cx="8" cy="16" r="2.5" />
      <circle cx="16" cy="16" r="2.5" />
      <path d="M10.2 8h3.6M8 10.2v3.6M16 10.2v3.6M10.2 16h3.6" />
    </Svg>
  );
}

export function IconInspection(p: IconProps) {
  return (
    <Svg {...p}>
      <circle cx="10.5" cy="10.5" r="6" />
      <path d="M15 15l5 5" />
      <path d="M8 10.5h5M10.5 8v5" />
    </Svg>
  );
}

export function IconEvent(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M13 2L5 13h6l-1 9 9-13h-6l0-7z" fill={p.color || "currentColor"} stroke="none" />
    </Svg>
  );
}

export function IconProduction(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M4 18h16" />
      <path d="M6 18V10l4-3 4 5 4-4v10" />
      <path d="M9 18v-4h6v4" />
    </Svg>
  );
}

export function IconTimeseries(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M3 17c2.5-1 3.5-5 6-5s3.5 4 6 4 3-3 6-6" />
      <path d="M3 5v14h18" />
    </Svg>
  );
}

export function IconDoc(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M7 3h7l5 5v13a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z" />
      <path d="M14 3v5h5M9 13h6M9 17h4" />
    </Svg>
  );
}

export function IconModel(p: IconProps) {
  return (
    <Svg {...p}>
      <circle cx="12" cy="12" r="8" />
      <circle cx="12" cy="12" r="3" />
      <path d="M12 4v3M12 17v3M4 12h3M17 12h3" />
    </Svg>
  );
}

export function IconMaintenance(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L4 17l3 3 5.3-5.3a4 4 0 0 0 5.4-5.4l-2.5 2.5-2.5-2.5 2.5-2.5z" />
    </Svg>
  );
}

export function IconMap(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M9 4l-5 2v14l5-2 6 2 5-2V4l-5 2-6-2z" />
      <path d="M9 4v14M15 6v14" />
    </Svg>
  );
}

export function IconSource(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M7 8h10M7 16h10" />
      <path d="M17 5l3 3-3 3M7 19l-3-3 3-3" />
    </Svg>
  );
}

export function IconGeneric(p: IconProps) {
  return (
    <Svg {...p}>
      <rect x="5" y="5" width="14" height="14" rx="3" />
    </Svg>
  );
}

const KIND_ICONS: Record<string, (p: IconProps) => React.ReactElement> = {
  facility: IconFacility,
  area: IconArea,
  line: IconLine,
  station: IconStation,
  device: IconDevice,
  model: IconModel,
  doc: IconDoc,
  image: IconInspection,
  timeseries: IconTimeseries,
  production: IconProduction,
  event: IconEvent,
  maintenance: IconMaintenance,
  map: IconMap,
  source: IconSource,
};

const CATEGORY_ICONS: Record<string, (p: IconProps) => React.ReactElement> = {
  entities: IconEntities,
  inspections: IconInspection,
  quality: IconEvent,
  production: IconProduction,
  timeseries: IconTimeseries,
  support: IconDoc,
};

function labelIcon(label: string): ((p: IconProps) => React.ReactElement) | null {
  const t = label.toLowerCase();
  if (t.includes("paint") || t.includes("finish")) return IconPaint;
  if (t.includes("powertrain") || t.includes("engine") || t.includes("torque")) return IconPowertrain;
  if (t.includes("fabricat") || t.includes("frame") || t.includes("weld")) return IconFabrication;
  if (t.includes("assembl")) return IconAssembly;
  if (t.includes("test") || t.includes("dyno") || t.includes("end of line")) return IconTest;
  if (t.includes("camera") || t.includes("vision") || t.includes("gige")) return IconCamera;
  if (t.includes("facility") || t.includes("york") || t.includes("plant")) return IconFacility;
  return null;
}

/** Small SVG for a graph node card (leaf / root). */
export function GraphNodeIcon({
  kind,
  label,
  color = "#1F9D5C",
  size = 16,
  className,
}: {
  kind?: string;
  label?: string;
  color?: string;
  size?: number;
  className?: string;
}) {
  const byLabel = label ? labelIcon(label) : null;
  const Comp = byLabel || (kind && KIND_ICONS[kind]) || IconGeneric;
  return <Comp color={color} size={size} className={className} />;
}

/** Small SVG for a cinema category card. */
export function GraphCategoryIcon({
  categoryId,
  color = "#1F9D5C",
  size = 16,
  className,
}: {
  categoryId: string;
  color?: string;
  size?: number;
  className?: string;
}) {
  const Comp = CATEGORY_ICONS[categoryId] || IconEntities;
  return <Comp color={color} size={size} className={className} />;
}
