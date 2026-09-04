import React from "react";

import type { TablePayload } from "../types";

export function TableBlock({ payload }: { payload: TablePayload }) {
  return (
    <div className="copilot-block copilot-block-table">
      <div className="copilot-block-title">{payload.title}</div>
      <div className="copilot-table-scroll">
        <table className="copilot-table">
          <thead>
            <tr>
              {payload.columns.map((c) => (
                <th key={c.key}>{c.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {payload.rows.map((row, i) => (
              <tr key={String(row.id ?? i)}>
                {payload.columns.map((c) => (
                  <td key={c.key}>{row[c.key] ?? "—"}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
