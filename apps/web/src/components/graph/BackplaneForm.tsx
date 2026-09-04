"use client";

import { Panel } from "@/components/ui";
import {
  BackplaneConfig,
  BackplaneDataplane,
  BackplaneLevel,
  dataplaneStyle,
} from "@/lib/graphBackplane";

type Props = {
  value: BackplaneConfig;
  onChange: (next: BackplaneConfig) => void;
  onReset: () => void;
};

export function BackplaneForm({ value, onChange, onReset }: Props) {
  const setLevel = (id: string, patch: Partial<BackplaneLevel>) => {
    onChange({
      ...value,
      levels: value.levels.map((l) => (l.id === id ? { ...l, ...patch } : l)),
    });
  };

  const setPlane = (id: string, patch: Partial<BackplaneDataplane>) => {
    onChange({
      ...value,
      dataplanes: value.dataplanes.map((d) => (d.id === id ? { ...d, ...patch } : d)),
    });
  };

  const levelOptions = value.levels.map((l) => l.id);

  return (
    <Panel
      title="Backplane designer"
      action={
        <button type="button" className="btn ghost sm" onClick={onReset}>
          Reset seed
        </button>
      }
    >
      <p className="muted" style={{ marginBottom: 10, fontSize: 12 }}>
        Form defines hierarchy columns and which dataplanes attach at each level. Tree renders from
        this schema + graph API data. Preference saved in localStorage.
      </p>

      <label className="field-label">Name</label>
      <input
        className="input"
        value={value.name}
        onChange={(e) => onChange({ ...value, name: e.target.value })}
      />

      <label className="field-label">Direction</label>
      <select
        className="input"
        value={value.direction}
        onChange={(e) =>
          onChange({ ...value, direction: e.target.value as "ltr" | "ttb" })
        }
      >
        <option value="ltr">Left → right</option>
        <option value="ttb">Top → bottom</option>
      </select>

      <h4 className="form-section">Levels (columns)</h4>
      <div className="backplane-level-list">
        {value.levels.map((lvl) => (
          <div key={lvl.id} className="backplane-level-row">
            <label className="check">
              <input
                type="checkbox"
                checked={lvl.enabled !== false}
                onChange={(e) => setLevel(lvl.id, { enabled: e.target.checked })}
              />
              <span className="mono">{lvl.id}</span>
            </label>
            <input
              className="input sm"
              value={lvl.label}
              onChange={(e) => setLevel(lvl.id, { label: e.target.value })}
              aria-label={`${lvl.id} label`}
            />
            <span className="muted kinds">{(lvl.kinds || []).join(", ")}</span>
          </div>
        ))}
      </div>

      <h4 className="form-section">Dataplane attachments</h4>
      <div className="backplane-plane-list">
        {value.dataplanes.map((dp) => {
          const st = dataplaneStyle(dp.object_type);
          return (
            <div key={dp.id} className="backplane-plane-row">
              <label className="check">
                <input
                  type="checkbox"
                  checked={dp.enabled !== false}
                  onChange={(e) => setPlane(dp.id, { enabled: e.target.checked })}
                />
                <span style={{ color: st.color }}>{st.glyph}</span>
                <strong>{dp.label}</strong>
              </label>
              <div className="backplane-plane-fields">
                <label className="muted">
                  Attach @
                  <select
                    className="input sm"
                    value={dp.attach_at}
                    onChange={(e) => setPlane(dp.id, { attach_at: e.target.value })}
                  >
                    {levelOptions.map((id) => (
                      <option key={id} value={id}>
                        {id}
                      </option>
                    ))}
                  </select>
                </label>
                <span className="mono muted">{dp.object_type}</span>
              </div>
            </div>
          );
        })}
      </div>
    </Panel>
  );
}
