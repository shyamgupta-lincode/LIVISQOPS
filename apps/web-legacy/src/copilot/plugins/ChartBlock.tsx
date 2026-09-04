import React, { useMemo } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import type { ChartPayload } from "../types";

const MUTED = "var(--text-faint)";
const GRID = "var(--border)";

export function ChartBlock({ payload }: { payload: ChartPayload }) {
  const colors = useMemo(
    () =>
      payload.series.map(
        (s, i) =>
          s.color ||
          ["var(--app-color, var(--accent))", "#1F9D5C", "#C4841D", "#3E96F4"][i % 4],
      ),
    [payload.series],
  );

  const data = payload.data;
  const xKey = payload.xKey;
  const tipStyle = {
    borderRadius: 10,
    border: "1px solid var(--border)",
    fontSize: 12,
  };

  return (
    <div className="copilot-block copilot-block-chart">
      <div className="copilot-block-title">{payload.title}</div>
      <div className="copilot-chart-wrap">
        <ResponsiveContainer width="100%" height={180}>
          {payload.chartType === "bar" ? (
            <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={GRID} />
              <XAxis dataKey={xKey} tick={{ fill: MUTED, fontSize: 11 }} />
              <YAxis tick={{ fill: MUTED, fontSize: 11 }} width={36} />
              <Tooltip contentStyle={tipStyle} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              {payload.series.map((s, i) => (
                <Bar key={s.key} dataKey={s.key} name={s.label || s.key} fill={colors[i]} radius={[4, 4, 0, 0]} />
              ))}
            </BarChart>
          ) : payload.chartType === "line" ? (
            <LineChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={GRID} />
              <XAxis dataKey={xKey} tick={{ fill: MUTED, fontSize: 11 }} />
              <YAxis tick={{ fill: MUTED, fontSize: 11 }} width={36} />
              <Tooltip contentStyle={tipStyle} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              {payload.series.map((s, i) => (
                <Line
                  key={s.key}
                  type="monotone"
                  dataKey={s.key}
                  name={s.label || s.key}
                  stroke={colors[i]}
                  strokeWidth={2}
                  dot={false}
                />
              ))}
            </LineChart>
          ) : (
            <AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={GRID} />
              <XAxis dataKey={xKey} tick={{ fill: MUTED, fontSize: 11 }} />
              <YAxis tick={{ fill: MUTED, fontSize: 11 }} width={36} />
              <Tooltip contentStyle={tipStyle} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              {payload.series.map((s, i) => (
                <Area
                  key={s.key}
                  type="monotone"
                  dataKey={s.key}
                  name={s.label || s.key}
                  stroke={colors[i]}
                  fill={colors[i]}
                  fillOpacity={0.18}
                  strokeWidth={2}
                />
              ))}
            </AreaChart>
          )}
        </ResponsiveContainer>
      </div>
    </div>
  );
}
