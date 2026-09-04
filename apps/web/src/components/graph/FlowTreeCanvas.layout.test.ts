import { describe, expect, it } from "vitest";
import type { FlowNode } from "../../lib/graphBackplane";
import { estimateNodeHeight, layoutForest } from "./FlowTreeCanvas";

function device(id: string, label: string): FlowNode {
  return {
    id,
    kind: "equipment",
    level: "device",
    label,
    props: { health_index: 0.92, state: "running" },
    link: {
      protocol: "OPC UA",
      endpoint: `opc.tcp://host/ns=2;s=${label}`,
    },
    binding_slots: [
      { id: `${id}-sig`, object_type: "signal", label: "Signals", mode: "home", protocol: "OPC UA" },
      { id: `${id}-evt`, object_type: "event", label: "Events", mode: "home", protocol: "Kafka" },
      { id: `${id}-doc`, object_type: "document", label: "Docs", mode: "home", protocol: "HTTP" },
    ],
    children: [],
  };
}

describe("flow-tree layout packing", () => {
  it("spaces sibling devices by measured/estimated height + gap (no overlap)", () => {
    const cell: FlowNode = {
      id: "cell-4",
      kind: "cell",
      level: "station",
      label: "Cell 4",
      children: [device("a1", "Cell 4 Asset 1"), device("a2", "Cell 4 Asset 2")],
    };
    const laid = layoutForest([cell], {}, "ltr");
    const devices = laid
      .filter((n) => n.node.level === "device")
      .sort((a, b) => a.y - b.y);
    expect(devices).toHaveLength(2);
    const [prev, next] = devices;
    const gap = 16;
    expect(next.y).toBeGreaterThanOrEqual(prev.y + prev.h + gap);
    // Calibrated so a ~141px rendered device card fits the reserved slot.
    expect(prev.h).toBeGreaterThanOrEqual(141);
    expect(estimateNodeHeight(prev.node, true)).toBe(prev.h);
  });

  it("keeps non-overlapping leaves under Discrete Assembly-style station siblings", () => {
    const line: FlowNode = {
      id: "line",
      kind: "line",
      level: "line",
      label: "Discrete Assembly",
      children: [
        {
          id: "spindle",
          kind: "station",
          level: "station",
          label: "Spindle Bearing Station",
          children: [device("s1", "Spindle 1"), device("s2", "Spindle 2")],
        },
        {
          id: "press",
          kind: "station",
          level: "station",
          label: "Press Station",
          children: [device("p1", "Press 1")],
        },
      ],
    };
    const laid = layoutForest([line], {}, "ltr");
    const byDepth = new Map<number, typeof laid>();
    for (const n of laid) {
      const row = byDepth.get(n.depth) || [];
      row.push(n);
      byDepth.set(n.depth, row);
    }
    for (const siblings of byDepth.values()) {
      const sorted = [...siblings].sort((a, b) => a.y - b.y);
      for (let i = 1; i < sorted.length; i++) {
        expect(sorted[i].y).toBeGreaterThanOrEqual(sorted[i - 1].y + sorted[i - 1].h);
      }
    }
  });
});
