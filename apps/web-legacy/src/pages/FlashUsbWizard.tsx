// Flash Edge+ (USB) wizard — station → data types → preview → connect → flash.
// Sim USB works without hardware; Web Serial uses EPUSB1 length+CRC framing.

import React, { useEffect, useMemo, useState } from "react";

import { get, post } from "../api";
import { Field, Modal, toast } from "../components/ui";

const EDGEPLUS_PROTOCOLS = ["mqtt", "opcua", "vision", "livis_edge", "mes", "sap"] as const;
const COMPANION_URL = "http://127.0.0.1:8765/usb-flash";

const STEPS = [
  { id: "station", label: "Station" },
  { id: "types", label: "Data types" },
  { id: "preview", label: "Preview" },
  { id: "connect", label: "Connect" },
  { id: "flash", label: "Flash" },
] as const;

type CtxDevice = {
  id: string;
  name?: string;
  kind?: string;
  protocol?: string;
  tag_count?: number;
};
type CtxStation = {
  id: string;
  name?: string;
  archetype?: string;
  devices: CtxDevice[];
};
type CtxLine = { id: string; name?: string; stations: CtxStation[] };
type CtxArea = { id: string; name?: string; code?: string; lines: CtxLine[] };
type ContextOptions = {
  site?: { id: string; name?: string; code?: string } | null;
  areas: CtxArea[];
  context_graph?: { id?: string; name?: string } | null;
  protocols?: string[];
};

type FlashBundle = {
  bundle_version?: string;
  node_id: string;
  recipe: Record<string, any>;
  passport?: Record<string, any>;
  mes_url?: string;
  flashed_at?: string;
  source?: string;
  data_types?: string[];
  protocols?: string[];
};

type BundleResponse = {
  ok: boolean;
  created?: boolean;
  node_id: string;
  bundle: FlashBundle;
  summary?: {
    recipe_id?: string;
    recipe_version?: string;
    device_count?: number;
    protocols?: string[];
    station?: Record<string, string>;
  };
};

type UsbDeviceOption = {
  id: string;
  label: string;
  kind: "sim" | "companion" | "web-serial";
};

function crc32(bytes: Uint8Array): number {
  let c = ~0;
  for (let i = 0; i < bytes.length; i++) {
    c ^= bytes[i];
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? (0xedb88320 ^ (c >>> 1)) : c >>> 1;
    }
  }
  return ~c >>> 0;
}

function encodeEpUsbFrame(obj: unknown): Uint8Array {
  const json = new TextEncoder().encode(JSON.stringify(obj));
  const out = new Uint8Array(6 + 4 + json.length + 4);
  out.set([0x45, 0x50, 0x55, 0x53, 0x42, 0x31], 0); // EPUSB1
  const view = new DataView(out.buffer);
  view.setUint32(6, json.length, false);
  out.set(json, 10);
  view.setUint32(10 + json.length, crc32(json), false);
  return out;
}

async function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

type Props = {
  onClose: () => void;
  onDone?: () => void;
  initialStationId?: string;
  initialNodeId?: string;
};

export default function FlashUsbWizard({
  onClose,
  onDone,
  initialStationId,
  initialNodeId,
}: Props) {
  const [step, setStep] = useState(0);
  const [ctx, setCtx] = useState<ContextOptions | null>(null);
  const [areaId, setAreaId] = useState("");
  const [lineId, setLineId] = useState("");
  const [stationId, setStationId] = useState(initialStationId || "");
  const [deviceId, setDeviceId] = useState("");
  const [nodeId, setNodeId] = useState(initialNodeId || "");
  const [protocols, setProtocols] = useState<string[]>([...EDGEPLUS_PROTOCOLS]);
  const [dataTypes, setDataTypes] = useState<string[]>([]);
  const [bundleRes, setBundleRes] = useState<BundleResponse | null>(null);
  const [loadingBundle, setLoadingBundle] = useState(false);
  const [deviceOpt, setDeviceOpt] = useState<string>("sim");
  const [serialPort, setSerialPort] = useState<any>(null);
  const [flashing, setFlashing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [flashLog, setFlashLog] = useState<string[]>([]);
  const [flashError, setFlashError] = useState<string | null>(null);
  const [flashOk, setFlashOk] = useState(false);
  const [companionOk, setCompanionOk] = useState<boolean | null>(null);

  const areas = ctx?.areas ?? [];
  const lines = areas.find((a) => a.id === areaId)?.lines ?? [];
  const stations = lines.find((l) => l.id === lineId)?.stations ?? [];
  const devices = stations.find((s) => s.id === stationId)?.devices ?? [];
  const station = stations.find((s) => s.id === stationId);

  const dataTypeOptions = useMemo(() => {
    const set = new Set<string>();
    for (const d of devices) {
      if (d.kind) set.add(d.kind);
      if (d.protocol) set.add(String(d.protocol).toLowerCase().replace(/\s+/g, "_"));
    }
    for (const p of EDGEPLUS_PROTOCOLS) set.add(p);
    ["plc", "vision_system", "torque_gun", "scanner", "float", "int", "bool"].forEach((x) =>
      set.add(x)
    );
    return Array.from(set).sort();
  }, [devices]);

  const usbDevices: UsbDeviceOption[] = useMemo(() => {
    const list: UsbDeviceOption[] = [
      { id: "sim", label: "Demo Edge+ (sim USB)", kind: "sim" },
      {
        id: "companion",
        label: `Local companion :8765${companionOk === true ? " · online" : companionOk === false ? " · offline" : ""}`,
        kind: "companion",
      },
    ];
    if (typeof (navigator as any).serial !== "undefined") {
      list.push({
        id: "web-serial",
        label: serialPort
          ? "Web Serial · connected"
          : "Web Serial · Edge+ CDC gadget",
        kind: "web-serial",
      });
    }
    return list;
  }, [companionOk, serialPort]);

  useEffect(() => {
    get<ContextOptions>("/api/edge/context-options")
      .then((opts) => {
        setCtx(opts);
        let a = opts.areas?.[0];
        let l = a?.lines?.[0];
        let s = l?.stations?.[0];
        if (initialStationId) {
          for (const area of opts.areas || []) {
            for (const line of area.lines || []) {
              const hit = line.stations?.find((st) => st.id === initialStationId);
              if (hit) {
                a = area;
                l = line;
                s = hit;
              }
            }
          }
        }
        if (a) setAreaId(a.id);
        if (l) setLineId(l.id);
        if (s) {
          setStationId(s.id);
          if (!initialNodeId) setNodeId(`edge-${s.id.replace(/^st-/, "")}`);
        }
      })
      .catch((e) => toast(String(e.message || e)));

    fetch(COMPANION_URL.replace("/usb-flash", "/health"))
      .then((r) => setCompanionOk(r.ok))
      .catch(() => setCompanionOk(false));
  }, [initialStationId, initialNodeId]);

  const pushLog = (line: string) => setFlashLog((prev) => [...prev, line]);

  const buildBundle = async () => {
    if (!stationId) {
      toast("Select a station");
      return null;
    }
    setLoadingBundle(true);
    try {
      const res = await post<BundleResponse>("/api/edge/usb-flash-bundle", {
        station_id: stationId,
        device_id: deviceId || null,
        node_id: nodeId || null,
        name: station?.name ? `${station.name} · Edge+` : null,
        protocols: protocols.length ? protocols : [...EDGEPLUS_PROTOCOLS],
        data_types: dataTypes,
        create_node: true,
        mes_url: "http://127.0.0.1:8000",
        actor: "Jordan Hale",
      });
      setBundleRes(res);
      return res;
    } catch (e: any) {
      toast(String(e.message || e));
      return null;
    } finally {
      setLoadingBundle(false);
    }
  };

  const connectWebSerial = async () => {
    try {
      const nav = navigator as any;
      if (!nav.serial) {
        toast("Web Serial not available in this browser");
        return;
      }
      const port = await nav.serial.requestPort();
      await port.open({ baudRate: 115200 });
      setSerialPort(port);
      setDeviceOpt("web-serial");
      toast("Web Serial port opened");
    } catch (e: any) {
      if (e?.name !== "NotFoundError") toast(String(e.message || e));
    }
  };

  const downloadBundle = () => {
    if (!bundleRes?.bundle) return;
    const blob = new Blob([JSON.stringify(bundleRes.bundle, null, 2)], {
      type: "application/json",
    });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${bundleRes.node_id || "edge"}-usb-flash-bundle.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const runFlash = async () => {
    setFlashing(true);
    setFlashError(null);
    setFlashOk(false);
    setProgress(0);
    setFlashLog([]);
    try {
      let res = bundleRes;
      if (!res) {
        pushLog("Resolving flash bundle from QualityOps…");
        res = await buildBundle();
        if (!res) throw new Error("Could not build flash bundle");
      }
      const bundle = res.bundle;
      pushLog(`Bundle ready · ${bundle.node_id} · ${res.summary?.recipe_id} v${res.summary?.recipe_version}`);
      setProgress(20);

      const channel =
        deviceOpt === "web-serial"
          ? "web-serial"
          : deviceOpt === "companion"
            ? "cli"
            : "sim";

      if (deviceOpt === "sim") {
        pushLog("Connecting Demo Edge+ (sim USB)…");
        await sleep(400);
        setProgress(45);
        pushLog("Writing framed EPUSB1 payload (simulated)…");
        await sleep(500);
        setProgress(70);
        pushLog("Device ACK: applied");
        setProgress(90);
      } else if (deviceOpt === "companion") {
        pushLog(`POST ${COMPANION_URL}`);
        setProgress(40);
        const r = await fetch(COMPANION_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(bundle),
        });
        const body = await r.json().catch(() => ({}));
        if (!r.ok || body.ok === false) {
          throw new Error(body.error || `Companion returned ${r.status}`);
        }
        pushLog(`Companion applied → ${body.cache || "data/flashed_recipe.json"}`);
        setProgress(85);
      } else if (deviceOpt === "web-serial") {
        if (!serialPort) throw new Error("Connect a Web Serial port first");
        pushLog("Sending EPUSB1 framed bundle over Web Serial…");
        const frame = encodeEpUsbFrame(bundle);
        const writer = serialPort.writable.getWriter();
        await writer.write(frame);
        writer.releaseLock();
        setProgress(60);
        pushLog(`Sent ${frame.byteLength} bytes — awaiting ACK…`);
        // Best-effort ACK read (gadget may respond; sim path may not)
        try {
          const reader = serialPort.readable.getReader();
          const timeout = sleep(2500).then(() => null);
          const read = reader.read().then((v: any) => v);
          const result = await Promise.race([read, timeout]);
          reader.releaseLock();
          if (result?.value?.length) {
            pushLog(`Received ${result.value.length} ACK bytes`);
          } else {
            pushLog("No ACK within timeout — assuming apply on device (demo)");
          }
        } catch {
          pushLog("ACK read skipped");
        }
        setProgress(85);
      }

      pushLog("Recording USB flash audit on QualityOps…");
      await post(`/api/edge/nodes/${bundle.node_id}/usb-flash-complete`, {
        actor: "Jordan Hale",
        recipe_id: res.summary?.recipe_id || bundle.recipe?.recipe_id,
        recipe_version: res.summary?.recipe_version || bundle.recipe?.recipe_version,
        status: "applied",
        channel,
        detail: `USB flash via ${channel}`,
      });
      setProgress(100);
      setFlashOk(true);
      pushLog("Flash complete");
      toast(`Flashed ${bundle.node_id} via ${channel}`);
      onDone?.();
    } catch (e: any) {
      setFlashError(String(e.message || e));
      pushLog(`ERROR: ${e.message || e}`);
      toast(String(e.message || e));
    } finally {
      setFlashing(false);
    }
  };

  const canNext = () => {
    if (step === 0) return Boolean(stationId);
    if (step === 1) return protocols.length > 0;
    if (step === 2) return Boolean(bundleRes);
    if (step === 3) return Boolean(deviceOpt);
    return true;
  };

  const goNext = async () => {
    if (step === 1 || (step === 2 && !bundleRes)) {
      const res = await buildBundle();
      if (!res) return;
      if (step === 1) setStep(2);
      else setStep(Math.min(step + 1, STEPS.length - 1));
      return;
    }
    if (step === STEPS.length - 1) {
      await runFlash();
      return;
    }
    setStep((s) => Math.min(s + 1, STEPS.length - 1));
  };

  const toggleProto = (p: string) => {
    setProtocols((prev) => (prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p]));
    setBundleRes(null);
  };

  const toggleDataType = (t: string) => {
    setDataTypes((prev) => (prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]));
    setBundleRes(null);
  };

  return (
    <Modal
      title="Flash Edge+ (USB)"
      subtitle="Station + data types → recipe bundle → USB / sim flash"
      onClose={onClose}
      xl
      footer={
        <>
          <button className="btn ghost" onClick={onClose} disabled={flashing}>
            Close
          </button>
          {step > 0 && step < STEPS.length - 1 && (
            <button className="btn ghost" onClick={() => setStep((s) => s - 1)} disabled={flashing}>
              Back
            </button>
          )}
          {step === 2 && bundleRes && (
            <button className="btn ghost" onClick={downloadBundle} disabled={flashing}>
              Download bundle
            </button>
          )}
          <button
            className="btn success"
            onClick={goNext}
            disabled={flashing || loadingBundle || !canNext()}
          >
            {loadingBundle
              ? "Building…"
              : flashing
                ? "Flashing…"
                : step === STEPS.length - 1
                  ? flashOk
                    ? "Flash again"
                    : "Flash now"
                  : step === 1
                    ? "Build recipe"
                    : "Continue"}
          </button>
        </>
      }
    >
      <div className="usb-flash-wizard">
        <div className="wizard-stepper">
          {STEPS.map((s, i) => (
            <button
              key={s.id}
              type="button"
              className={`wizard-step ${i === step ? "active" : ""} ${i < step ? "done" : "todo"}`}
              onClick={() => i <= step && setStep(i)}
              disabled={flashing || i > step}
            >
              <span className="wizard-num">{i + 1}</span>
              {s.label}
            </button>
          ))}
        </div>

        <div className="wizard-panel">
          <div className="wizard-body">
            {step === 0 && (
              <>
                <h3 className="wizard-heading">Select station</h3>
                <p className="wizard-lead">
                  Bind the flash to a context-graph station (and optional device focus).
                </p>
                <div className="form-grid">
                  <div>
                    <Field label="Facility">
                      <input className="field" value={ctx?.site?.name || "—"} disabled />
                    </Field>
                  </div>
                  <div>
                    <Field label="Area" required>
                      <select
                        className="field"
                        value={areaId}
                        onChange={(e) => {
                          setAreaId(e.target.value);
                          const line = areas.find((a) => a.id === e.target.value)?.lines?.[0];
                          setLineId(line?.id || "");
                          const st = line?.stations?.[0];
                          setStationId(st?.id || "");
                          if (st) setNodeId(`edge-${st.id.replace(/^st-/, "")}`);
                          setDeviceId("");
                          setBundleRes(null);
                        }}
                      >
                        {areas.map((a) => (
                          <option key={a.id} value={a.id}>
                            {a.name}
                          </option>
                        ))}
                      </select>
                    </Field>
                  </div>
                  <div>
                    <Field label="Line" required>
                      <select
                        className="field"
                        value={lineId}
                        onChange={(e) => {
                          setLineId(e.target.value);
                          const st = lines.find((l) => l.id === e.target.value)?.stations?.[0];
                          setStationId(st?.id || "");
                          if (st) setNodeId(`edge-${st.id.replace(/^st-/, "")}`);
                          setDeviceId("");
                          setBundleRes(null);
                        }}
                      >
                        {lines.map((l) => (
                          <option key={l.id} value={l.id}>
                            {l.name}
                          </option>
                        ))}
                      </select>
                    </Field>
                  </div>
                  <div>
                    <Field label="Station" required>
                      <select
                        className="field"
                        value={stationId}
                        onChange={(e) => {
                          setStationId(e.target.value);
                          setNodeId(`edge-${e.target.value.replace(/^st-/, "")}`);
                          setDeviceId("");
                          setBundleRes(null);
                        }}
                      >
                        {stations.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.name} ({s.devices?.length || 0} devices)
                          </option>
                        ))}
                      </select>
                    </Field>
                  </div>
                  <div className="span-2">
                    <Field label="Device (optional)">
                      <select
                        className="field"
                        value={deviceId}
                        onChange={(e) => {
                          setDeviceId(e.target.value);
                          setBundleRes(null);
                        }}
                      >
                        <option value="">All station devices</option>
                        {devices.map((d) => (
                          <option key={d.id} value={d.id}>
                            {d.name} · {d.kind} / {d.protocol}
                          </option>
                        ))}
                      </select>
                    </Field>
                  </div>
                  <div className="span-2">
                    <Field label="Edge+ node id">
                      <input
                        className="field mono"
                        value={nodeId}
                        onChange={(e) => {
                          setNodeId(e.target.value);
                          setBundleRes(null);
                        }}
                      />
                    </Field>
                  </div>
                </div>
              </>
            )}

            {step === 1 && (
              <>
                <h3 className="wizard-heading">Data types & protocols</h3>
                <p className="wizard-lead">
                  Filter which context devices and adapter stubs are packed into the USB recipe.
                </p>
                <Field label="Protocol adapters">
                  <div className="em-proto-row">
                    {EDGEPLUS_PROTOCOLS.map((p) => (
                      <label key={p} className={`em-proto-chip ${protocols.includes(p) ? "on" : ""}`}>
                        <input
                          type="checkbox"
                          checked={protocols.includes(p)}
                          onChange={() => toggleProto(p)}
                        />
                        {p}
                      </label>
                    ))}
                  </div>
                </Field>
                <Field label="Data types / kinds (optional filter)">
                  <div className="em-proto-row">
                    {dataTypeOptions.map((t) => (
                      <label key={t} className={`em-proto-chip ${dataTypes.includes(t) ? "on" : ""}`}>
                        <input
                          type="checkbox"
                          checked={dataTypes.includes(t)}
                          onChange={() => toggleDataType(t)}
                        />
                        {t}
                      </label>
                    ))}
                  </div>
                </Field>
                <p className="small faint" style={{ marginTop: 8 }}>
                  Leave data types empty to include all station devices plus selected protocol stubs.
                </p>
              </>
            )}

            {step === 2 && (
              <>
                <h3 className="wizard-heading">Recipe preview</h3>
                <p className="wizard-lead">
                  Bundle written to the device as <span className="mono">data/flashed_recipe.json</span>{" "}
                  plus passport / node.env.
                </p>
                {loadingBundle && <div className="small faint">Building bundle…</div>}
                {bundleRes && (
                  <div className="em-edge-preview">
                    <div className="em-edge-preview-head">
                      <strong>
                        {bundleRes.summary?.recipe_id} · v{bundleRes.summary?.recipe_version}
                      </strong>
                      <span className="small faint">
                        {bundleRes.node_id}
                        {bundleRes.created ? " · new node" : ""} ·{" "}
                        {bundleRes.summary?.device_count ?? 0} devices
                      </span>
                    </div>
                    <table className="data em-edge-dev-table">
                      <thead>
                        <tr>
                          <th>Device</th>
                          <th>Type</th>
                          <th>Protocol</th>
                          <th>Tags</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(bundleRes.bundle.recipe?.devices || []).map((d: any) => (
                          <tr key={d.id}>
                            <td>{d.name}</td>
                            <td>
                              <span className="tag">{d.device_type}</span>
                            </td>
                            <td>
                              <span className="tag">{d.protocol}</span>
                            </td>
                            <td className="mono small">{(d.tags || []).length}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </>
            )}

            {step === 3 && (
              <>
                <h3 className="wizard-heading">Connect device</h3>
                <p className="wizard-lead">
                  Use sim USB for demos, localhost companion for CLI apply, or Web Serial for a CDC gadget.
                </p>
                <div className="usb-device-list">
                  {usbDevices.map((d) => (
                    <label
                      key={d.id}
                      className={`usb-device-row ${deviceOpt === d.id ? "on" : ""}`}
                    >
                      <input
                        type="radio"
                        name="usb-dev"
                        checked={deviceOpt === d.id}
                        onChange={() => setDeviceOpt(d.id)}
                      />
                      <span>{d.label}</span>
                    </label>
                  ))}
                </div>
                {deviceOpt === "web-serial" && (
                  <button className="btn" style={{ marginTop: 12 }} onClick={connectWebSerial}>
                    {serialPort ? "Reselect serial port" : "Request Web Serial port"}
                  </button>
                )}
                {deviceOpt === "companion" && companionOk === false && (
                  <p className="small dim" style={{ marginTop: 10 }}>
                    Start companion:{" "}
                    <span className="mono">
                      edgeplus usb-listen --http 8765 --mount ./data
                    </span>
                  </p>
                )}
                {deviceOpt === "sim" && (
                  <p className="small dim" style={{ marginTop: 10 }}>
                    Sim path records audit on QualityOps and downloads are optional — no hardware required.
                  </p>
                )}
              </>
            )}

            {step === 4 && (
              <>
                <h3 className="wizard-heading">Flash</h3>
                <p className="wizard-lead">
                  Write recipe + passport so the Pi boots with this station config.
                </p>
                <div className="usb-progress">
                  <div className="usb-progress-bar" style={{ width: `${progress}%` }} />
                </div>
                <div className="small faint" style={{ marginBottom: 8 }}>
                  {progress}%
                  {flashOk ? " · success" : flashError ? " · failed" : flashing ? " · in progress" : ""}
                </div>
                {flashError && <div className="usb-flash-error">{flashError}</div>}
                {flashOk && (
                  <div className="usb-flash-ok">
                    Flashed {bundleRes?.node_id} — recipe cached as flashed_recipe.json on device.
                  </div>
                )}
                <pre className="usb-flash-log">{flashLog.join("\n") || "Ready — click Flash now."}</pre>
              </>
            )}
          </div>
        </div>
      </div>
    </Modal>
  );
}
