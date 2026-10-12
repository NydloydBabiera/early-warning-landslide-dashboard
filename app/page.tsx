"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Activity,
  ArrowDownToLine,
  ArrowUpRight,
  Bell,
  ChevronRight,
  CircuitBoard,
  CloudRain,
  Cpu,
  Droplets,
  Gauge,
  Layers3,
  Leaf,
  MapPin,
  Mountain,
  Radio,
  RefreshCw,
  Settings2,
  ShieldCheck,
  Signal,
  Thermometer,
  Waves,
  Wifi,
  WifiOff,
  X,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
const sensors = [
  {
    key: "soilMoisture",
    name: "Soil moisture",
    unit: "%",
    icon: Droplets,
    color: "#a5d988",
    max: 100,
    description: "Relative moisture index",
  },
  {
    key: "rainfall",
    name: "Rain plate wetness",
    unit: "%",
    icon: CloudRain,
    color: "#8ebcfa",
    max: 100,
    description: "Relative plate wetness",
  },
  {
    key: "tilt",
    name: "Slope inclination",
    unit: "°",
    icon: Gauge,
    color: "#d6b1f6",
    max: 180,
    description: "Inclination from horizontal",
  },
  {
    key: "vibration",
    name: "Vibration",
    unit: "g",
    icon: Activity,
    color: "#efbb84",
    max: 2,
    description: "1-second vibration RMS",
  },
  // {
  //   key: "temperature",
  //   name: "Temperature",
  //   unit: "°C",
  //   icon: Thermometer,
  //   color: "#e79ca1",
  //   max: 60,
  //   description: "Ambient temperature",
  // },
  // {
  //   key: "humidity",
  //   name: "Humidity",
  //   unit: "%",
  //   icon: Waves,
  //   color: "#8cd4cf",
  //   max: 100,
  //   description: "Relative humidity",
  // },
] as const;
type SensorKey = (typeof sensors)[number]["key"];
type Readings = Partial<Record<SensorKey, number>>;
type Modules = Partial<
  Record<"imu" | "rainGauge" | "soilProbe" | "environment" | "buzzer", boolean>
>;
type Sample = { time: number; values: Readings; demo: boolean };
type Log = { time: number; message: string };
type Connection = "idle" | "connecting" | "live" | "offline" | "demo";
const moduleList: {
  key: keyof Modules;
  name: string;
  detail: string;
  icon: LucideIcon;
}[] = [
  {
    key: "soilProbe",
    name: "Soil probe",
    detail: "Moisture sensor",
    icon: Leaf,
  },
  {
    key: "rainGauge",
    name: "Rain sensor",
    detail: "Analog wetness plate",
    icon: CloudRain,
  },
  {
    key: "imu",
    name: "Motion sensor",
    detail: "Tilt & vibration",
    icon: Activity,
  },
  {
    key: "environment",
    name: "Environment",
    detail: "Temperature & humidity",
    icon: Thermometer,
  },
  {
    key: "buzzer",
    name: "Alarm module",
    detail: "Buzzer availability",
    icon: Bell,
  },
];
function parsePacket(raw: unknown): {
  values: Readings;
  modules: Modules;
  uptime?: number;
  rssi?: number;
  sequence?: number;
} {
  if (!raw || typeof raw !== "object" || Array.isArray(raw))
    throw new Error("Expected a JSON object.");
  const packet = raw as Record<string, unknown>;
  if (
    !packet.sensors ||
    typeof packet.sensors !== "object" ||
    Array.isArray(packet.sensors)
  )
    throw new Error("Response must contain a sensors object.");
  const values: Readings = {};
  const incoming = packet.sensors as Record<string, unknown>;
  for (const sensor of sensors) {
    const value = incoming[sensor.key];
    if (typeof value === "number" && Number.isFinite(value))
      values[sensor.key] = value;
  }
  if (!Object.keys(values).length)
    throw new Error("No valid sensor readings received.");
  const modules: Modules = {};
  if (packet.modules && typeof packet.modules === "object") {
    const statuses = packet.modules as Record<string, unknown>;
    for (const module of moduleList)
      if (typeof statuses[module.key] === "boolean")
        modules[module.key] = statuses[module.key] as boolean;
  }
  return {
    values,
    modules,
    sequence:
      typeof packet.sequence === "number" && Number.isFinite(packet.sequence)
        ? packet.sequence
        : undefined,
    uptime:
      typeof packet.uptime === "number" &&
      Number.isFinite(packet.uptime) &&
      packet.uptime >= 0
        ? packet.uptime
        : undefined,
    rssi:
      typeof packet.rssi === "number" && Number.isFinite(packet.rssi)
        ? packet.rssi
        : undefined,
  };
}
function makeDemo(): ReturnType<typeof parsePacket> {
  const t = Date.now() / 9000;
  return {
    values: {
      soilMoisture: 36 + Math.sin(t) * 4,
      rainfall: 2.4 + Math.sin(t * 0.7),
      tilt: 3.2 + Math.sin(t) * 0.3,
      vibration: 0.04 + Math.abs(Math.sin(t)) * 0.02,
    },
    modules: {
      imu: true,
      rainGauge: true,
      soilProbe: true,
      environment: false,
      buzzer: false,
    },
  };
}
function formatValue(value: number, key: SensorKey) {
  return value.toFixed(key === "vibration" ? 3 : 1);
}
function timeLabel(time: number) {
  return new Date(time).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}
export default function Home() {
  const [status, setStatus] = useState<Connection>("idle");
  const [running, setRunning] = useState(false);
  const [demo, setDemo] = useState(false);
  const [endpoint, setEndpoint] = useState("http://192.168.4.1/api/readings");
  const [draftEndpoint, setDraftEndpoint] = useState(endpoint);
  const [settings, setSettings] = useState(false);
  const [error, setError] = useState("");
  const [values, setValues] = useState<Readings>({});
  const [modules, setModules] = useState<Modules>({});
  const [samples, setSamples] = useState<Sample[]>([]);
  const [logs, setLogs] = useState<Log[]>([]);
  const [selected, setSelected] = useState<SensorKey>("soilMoisture");
  const [windowMinutes, setWindowMinutes] = useState(5);
  const [lastSeen, setLastSeen] = useState<number | null>(null);
  const [uptime, setUptime] = useState<number>();
  const [rssi, setRssi] = useState<number>();
  const [now, setNow] = useState<number | null>(null);
  const [revision, setRevision] = useState(0);
  const lastEvent = useRef("");
  const settingsRef = useRef<HTMLDialogElement>(null);
  const logEvent = useCallback((message: string) => {
    if (lastEvent.current === message) return;
    lastEvent.current = message;
    setLogs((items) => [{ time: Date.now(), message }, ...items].slice(0, 30));
  }, []);
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  useEffect(() => {
    if (settings) settingsRef.current?.showModal();
    else settingsRef.current?.close();
  }, [settings]);
  useEffect(() => {
    if (!running) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    let activeRequest: AbortController | undefined;
    let lastSequence: number | undefined;
    let lastAdvancedAt = Date.now();
    const poll = async () => {
      const controller = new AbortController();
      activeRequest = controller;
      const timeout = setTimeout(() => controller.abort(), 4000);
      try {
        let packet;
        if (demo) packet = makeDemo();
        else {
          const response = await fetch(endpoint, {
            signal: controller.signal,
            cache: "no-store",
            credentials: "omit",
          });
          if (!response.ok)
            throw new Error("ESP32 returned HTTP " + response.status + ".");
          packet = parsePacket(await response.json());
          if (packet.sequence !== undefined) {
            if (packet.sequence !== lastSequence) {
              lastSequence = packet.sequence;
              lastAdvancedAt = Date.now();
            } else if (Date.now() - lastAdvancedAt > 6000) {
              throw new Error("ESP32 acquisition has stopped updating.");
            }
          }
        }
        if (stopped) return;
        const time = Date.now();
        setValues(packet.values);
        setModules(packet.modules);
        setUptime(packet.uptime);
        setRssi(packet.rssi);
        setStatus(demo ? "demo" : "live");
        setLastSeen(time);
        setError("");
        setSamples((items) =>
          [...items, { time, values: packet.values, demo }].slice(-900),
        );
        logEvent(
          demo
            ? "Demo stream active · simulated readings"
            : "ESP32 connected · readings received",
        );
      } catch (cause) {
        if (stopped) return;
        setValues({});
        setModules({});
        setUptime(undefined);
        setRssi(undefined);
        setStatus("offline");
        setSamples((items) =>
          [...items, { time: Date.now(), values: {}, demo: false }].slice(-900),
        );
        const message =
          cause instanceof Error && cause.name !== "AbortError"
            ? cause.message
            : "Device request timed out.";
        setError(
          message +
            " Join the ESP32 Wi-Fi and check its endpoint and CORS settings.",
        );
        logEvent("Device unavailable · readings unavailable");
      } finally {
        clearTimeout(timeout);
        if (!stopped) timer = setTimeout(poll, 2000);
      }
    };
    void poll();
    return () => {
      stopped = true;
      clearTimeout(timer);
      activeRequest?.abort();
    };
  }, [running, demo, endpoint, revision, logEvent]);
  function start(simulated: boolean) {
    setDemo(simulated);
    setRunning(true);
    setStatus(simulated ? "demo" : "connecting");
    setValues({});
    setModules({});
    setSamples([]);
    setLastSeen(null);
    setError("");
    setUptime(undefined);
    setRssi(undefined);
    setRevision((value) => value + 1);
  }
  function disconnect() {
    setRunning(false);
    setDemo(false);
    setStatus("idle");
    setValues({});
    setModules({});
    setUptime(undefined);
    setRssi(undefined);
    setError("");
    logEvent("Monitoring paused · readings unavailable");
  }
  function applySettings(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      const url = new URL(draftEndpoint);
      if (
        !["http:", "https:"].includes(url.protocol) ||
        url.username ||
        url.password ||
        url.hash
      )
        throw new Error();
      setEndpoint(url.toString());
      setSettings(false);
      start(false);
    } catch {
      setError(
        "Enter a complete HTTP or HTTPS URL without credentials or a fragment.",
      );
    }
  }
  function exportCsv() {
    const rows = [
      ["timestamp", "source", ...sensors.map((sensor) => sensor.key)],
      ...samples.map((sample) => [
        new Date(sample.time).toISOString(),
        sample.demo ? "demo" : "esp32",
        ...sensors.map((sensor) => sample.values[sensor.key] ?? ""),
      ]),
    ];
    const blob = new Blob([rows.map((row) => row.join(",")).join("\r\n")], {
      type: "text/csv;charset=utf-8;",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "Dashboard-readings-" + Date.now() + ".csv";
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    logEvent("Session readings exported as CSV");
  }
  const live = status === "live" || status === "demo";
  const sensor = sensors.find((item) => item.key === selected)!;
  const visible = samples.filter(
    (sample) => sample.time >= (now ?? lastSeen ?? 0) - windowMinutes * 60000,
  );
  const chartValues = visible.flatMap((sample) =>
    sample.values[selected] === undefined ? [] : [sample.values[selected]!],
  );
  const chartMax = Math.max(sensor.max, ...chartValues);
  const chartMin = Math.min(0, ...chartValues);
  const chartY = (value: number) =>
    170 - ((value - chartMin) / (chartMax - chartMin || 1)) * 146;
  const chartStart = visible[0]?.time ?? 0;
  const chartEnd = visible[visible.length - 1]?.time ?? 0;
  const chartX = (time: number) =>
    46 + ((time - chartStart) / (chartEnd - chartStart || 1)) * 710;
  let previousValid = false;
  const path = visible
    .map((sample) => {
      const value = sample.values[selected];
      if (value === undefined) {
        previousValid = false;
        return "";
      }
      const segment =
        (previousValid ? "L" : "M") + chartX(sample.time) + "," + chartY(value);
      previousValid = true;
      return segment;
    })
    .join(" ");
  const count = Object.keys(values).length;
  const statusLabel = {
    idle: "Not connected",
    connecting: "Connecting",
    live: "Live connection",
    offline: "Reconnecting",
    demo: "Demo mode",
  }[status];
  return (
    <div className="dashboard-shell">
      <aside className="sidebar">
        <a className="brand" href="#overview">
          <span className="brand-mark">
            <Mountain size={23} />
          </span>
          <span>
            Dash<span className="brand-light">board</span>
            <small>LANDSLIDE MONITORING</small>
          </span>
        </a>
        <div className="workspace">
          <span className="workspace-icon">
            <Layers3 size={17} />
          </span>
          <div>
            Field station<small>Local monitoring workspace</small>
          </div>
          <span className="tiny-dot" />
        </div>
        <p className="nav-label">WORKSPACE</p>
        <nav aria-label="Main navigation">
          <a className="nav-link active" href="#overview">
            <Gauge size={18} />
            Overview
            <span className="nav-indicator" />
          </a>
          <a className="nav-link" href="#sensors">
            <Activity size={18} />
            Sensor readings<span className="nav-count">{sensors.length}</span>
          </a>
          <a className="nav-link" href="#telemetry">
            <Waves size={18} />
            Live telemetry
          </a>
          <a className="nav-link" href="#modules">
            <Cpu size={18} />
            Device & modules
          </a>
          <a className="nav-link" href="#events">
            <Bell size={18} />
            Activity log
          </a>
        </nav>
        <p className="nav-label tools-label">TOOLS</p>
        <button
          className="nav-link"
          onClick={() => {
            setDraftEndpoint(endpoint);
            setSettings(true);
          }}
        >
          <Settings2 size={18} />
          Connection settings
        </button>
        <button
          className="nav-link"
          onClick={exportCsv}
          disabled={!samples.length}
        >
          <ArrowDownToLine size={18} />
          Export session
        </button>
        <div className="sidebar-bottom">
          <div className="local-card">
            <Radio size={19} />
            <strong>Built for the field</strong>
            <p>Direct communication with your ESP32 access point.</p>
            <span>
              LOCAL NETWORK <span className="tiny-dot" />
            </span>
          </div>
          <div className="profile">
            <span className="avatar">FO</span>
            <div>
              Field operator<small>Monitoring workspace</small>
            </div>
            <ShieldCheck size={17} />
          </div>
        </div>
      </aside>
      <div className="main-area">
        <header className="topbar">
          <div className="breadcrumb">
            Workspace <ChevronRight size={13} />
            <span>Overview</span>
          </div>
          <div className="topbar-right">
            <span className="local-badge">
              <Radio size={13} />
              Local-first monitoring
            </span>
            <span className="topbar-divider" />
            <span className="avatar small">FO</span>
          </div>
        </header>
        <main id="overview">
          <div className="page-heading">
            <div>
              <div className="eyebrow">
                <span className="tiny-dot" /> TERRAIN INTELLIGENCE
              </div>
              <h1>A clearer view of the ground.</h1>
              <p>Real-time insights. Connected sensors. Informed decisions.</p>
            </div>
            <button
              className="button secondary"
              onClick={exportCsv}
              disabled={!samples.length}
            >
              <ArrowDownToLine size={15} />
              Export data
            </button>
          </div>
          <div className="connection-strip">
            <div className="connection-summary">
              <span className={"connection-icon " + (live ? "connected" : "")}>
                {live ? <Wifi size={19} /> : <WifiOff size={19} />}
              </span>
              <div>
                <strong>ESP32 access point</strong>
                <span className={"status-tag " + (live ? "green" : "")}>
                  <i />
                  {statusLabel}
                </span>
                <small>{endpoint}</small>
              </div>
            </div>
            <div className="connection-actions">
              <span className="poll-note">Refreshes every 2s</span>
              <button
                className="icon-button"
                aria-label="Connection settings"
                onClick={() => {
                  setDraftEndpoint(endpoint);
                  setSettings(true);
                }}
              >
                <Settings2 size={17} />
              </button>
              <button
                className={"button " + (running ? "secondary" : "primary")}
                onClick={() => (running ? disconnect() : start(false))}
              >
                {running ? "Disconnect" : "Connect device"}
                <ArrowUpRight size={15} />
              </button>
            </div>
          </div>
          <div
            className={"notice " + (demo ? "demo-notice" : "")}
            role="status"
          >
            <span>
              <span className="notice-dot" />
              {demo
                ? "Demo mode is active. All readings are simulated."
                : live
                  ? count +
                    " of " +
                    sensors.length +
                    " sensor channels reporting. Missing channels display —."
                  : status === "connecting"
                    ? "Connecting to the ESP32 access point…"
                    : "Waiting for your device. Readings show — until sensor data arrives."}
            </span>
            <button onClick={() => (demo ? disconnect() : start(true))}>
              {demo ? "Exit demo" : "Explore demo"}
              <ArrowUpRight size={13} />
            </button>
          </div>
          {error && !settings && (
            <p className="error-message" role="alert">
              {error}
            </p>
          )}
          <div className="section-heading" id="sensors">
            <h2>
              Sensor overview <span>{sensors.length} channels</span>
            </h2>
            <span className="subtle">
              {lastSeen
                ? "Last received " + timeLabel(lastSeen)
                : "No readings received"}
            </span>
          </div>
          <section className="sensor-grid" aria-label="Sensor readings">
            {sensors.map((item) => {
              const Icon = item.icon;
              const available = live && values[item.key] !== undefined;
              const value = available ? values[item.key]! : 0;
              return (
                <button
                  className={
                    "sensor-card " + (selected === item.key ? "selected" : "")
                  }
                  style={
                    { "--sensor-color": item.color } as React.CSSProperties
                  }
                  key={item.key}
                  onClick={() => setSelected(item.key)}
                  aria-pressed={selected === item.key}
                >
                  <div className="sensor-top">
                    <span className="sensor-icon">
                      <Icon size={18} />
                    </span>
                    <span
                      className={
                        "reading-state " + (available ? "available" : "")
                      }
                    >
                      <i />
                      {available ? (demo ? "Simulated" : "Live") : "No data"}
                    </span>
                  </div>
                  <h3>{item.name}</h3>
                  <div className="reading">
                    {available ? formatValue(value, item.key) : "—"}
                    <span>{item.unit}</span>
                  </div>
                  <div className="sensor-track">
                    <span
                      style={{
                        width: available
                          ? Math.max(
                              0,
                              Math.min(100, (value / item.max) * 100),
                            ) + "%"
                          : "0%",
                      }}
                    />
                  </div>
                  <div className="sensor-bottom">
                    {item.description}
                    <ArrowUpRight size={13} />
                  </div>
                </button>
              );
            })}
          </section>
          <div className="analysis-grid">
            <section className="panel telemetry" id="telemetry">
              <div className="panel-heading">
                <div>
                  <h2>
                    Live telemetry <span className="live-dot" />
                  </h2>
                  <p>Watch the ground, one reading at a time.</p>
                </div>
                <div className="segmented" aria-label="Chart time window">
                  {[5, 15, 30].map((minutes) => (
                    <button
                      key={minutes}
                      className={windowMinutes === minutes ? "chosen" : ""}
                      onClick={() => setWindowMinutes(minutes)}
                    >
                      {minutes}m
                    </button>
                  ))}
                </div>
              </div>
              <div className="chart-toolbar">
                <label>
                  <span
                    className="legend-dot"
                    style={{ background: sensor.color }}
                  />
                  <select
                    aria-label="Chart sensor"
                    value={selected}
                    onChange={(event) =>
                      setSelected(event.target.value as SensorKey)
                    }
                  >
                    {sensors.map((item) => (
                      <option key={item.key} value={item.key}>
                        {item.name}
                      </option>
                    ))}
                  </select>
                </label>
                <span>
                  {sensor.unit}{" "}
                  <span className="subtle">
                    / {demo ? "simulated" : "session"} readings
                  </span>
                </span>
              </div>
              <div className="chart">
                <svg
                  viewBox="0 0 780 205"
                  role="img"
                  aria-label={sensor.name + " over time"}
                  preserveAspectRatio="none"
                >
                  {[0, 1, 2, 3, 4].map((tick) => (
                    <g key={tick}>
                      <line
                        x1="46"
                        x2="756"
                        y1={24 + tick * 36.5}
                        y2={24 + tick * 36.5}
                        stroke="#303933"
                        strokeDasharray="3 5"
                      />
                      <text
                        x="33"
                        y={28 + tick * 36.5}
                        textAnchor="end"
                        fill="#7f8b83"
                        fontSize="10"
                      >
                        {(
                          chartMax -
                          (tick * (chartMax - chartMin)) / 4
                        ).toFixed(sensor.key === "vibration" ? 1 : 0)}
                      </text>
                    </g>
                  ))}
                  {path && (
                    <path
                      d={path}
                      stroke={sensor.color}
                      fill="none"
                      strokeWidth="2.5"
                      strokeLinejoin="round"
                    />
                  )}
                  {visible
                    .filter((sample) => sample.values[selected] !== undefined)
                    .slice(-1)
                    .map((sample) => (
                      <circle
                        key={sample.time}
                        cx={chartX(sample.time)}
                        cy={chartY(sample.values[selected]!)}
                        r="4"
                        fill={sensor.color}
                      />
                    ))}
                  <text x="46" y="199" fill="#7f8b83" fontSize="10">
                    {visible.length ? timeLabel(chartStart) : "Session start"}
                  </text>
                  <text
                    x="756"
                    y="199"
                    textAnchor="end"
                    fill="#7f8b83"
                    fontSize="10"
                  >
                    {visible.length ? timeLabel(chartEnd) : "Now"}
                  </text>
                </svg>
                {!chartValues.length && (
                  <div className="chart-empty">
                    <Activity size={23} />
                    <strong>Your terrain has a story.</strong>
                    <span>Connect your device to see it unfold.</span>
                  </div>
                )}
              </div>
              <div className="chart-stats">
                {[
                  [
                    "Minimum",
                    chartValues.length ? Math.min(...chartValues) : 0,
                  ],
                  [
                    "Average",
                    chartValues.length
                      ? chartValues.reduce((a, b) => a + b, 0) /
                        chartValues.length
                      : 0,
                  ],
                  [
                    "Maximum",
                    chartValues.length ? Math.max(...chartValues) : 0,
                  ],
                ].map(([label, value]) => (
                  <div key={label}>
                    <span>{label}</span>
                    <strong>
                      {chartValues.length
                        ? formatValue(Number(value), selected)
                        : "—"}{" "}
                      <small>{sensor.unit}</small>
                    </strong>
                  </div>
                ))}
                <div>
                  <span>Samples</span>
                  <strong>
                    {chartValues.length}
                    <small> received</small>
                  </strong>
                </div>
              </div>
            </section>
            {/* <section className="panel terrain-panel">
              <div className="panel-heading">
                <div>
                  <h2>Terrain watch</h2>
                  <p>Field station · Node 01</p>
                </div>
                <MapPin size={17} />
              </div>
              <div className="terrain-visual">
                <svg viewBox="0 0 360 180" aria-hidden="true">
                  <defs>
                    <linearGradient
                      id="terrainFill"
                      x1="0"
                      y1="0"
                      x2="0"
                      y2="1"
                    >
                      <stop stopColor="#acd797" stopOpacity=".22" />
                      <stop offset="1" stopColor="#acd797" stopOpacity="0" />
                    </linearGradient>
                  </defs>
                  <path
                    d="M0 160L72 123 118 136 204 44 282 115 315 101 360 132V180H0Z"
                    fill="url(#terrainFill)"
                  />
                  {[0, 16, 32, 48, 64].map((offset) => (
                    <path
                      key={offset}
                      d={`M0 ${160 + offset}L72 ${123 + offset} 118 ${136 + offset} 204 ${44 + offset} 282 ${115 + offset} 315 ${101 + offset} 360 ${132 + offset}`}
                      fill="none"
                      stroke="#78986d"
                      strokeOpacity={0.65 - offset / 130}
                    />
                  ))}
                  {[50, 95, 145, 204, 255, 300].map((x) => (
                    <path
                      key={x}
                      d={`M204 44L${x} 180`}
                      stroke="#719569"
                      strokeOpacity=".22"
                    />
                  ))}
                  <circle
                    cx="204"
                    cy="44"
                    r="15"
                    fill="#b4e097"
                    fillOpacity=".08"
                  />
                  <circle
                    cx="204"
                    cy="44"
                    r="7"
                    fill="#b4e097"
                    fillOpacity=".15"
                  />
                  <circle cx="204" cy="44" r="3.5" fill="#b4e097" />
                  <path d="M204 29V15H248" stroke="#829c76" fill="none" />
                  <text
                    x="253"
                    y="19"
                    fill="#b9c8b1"
                    fontSize="9"
                    fontFamily="monospace"
                  >
                    NODE 01
                  </text>
                </svg>
                <span className="terrain-caption">ILLUSTRATIVE TERRAIN</span>
              </div>
              <div className="assessment">
                <span className="assessment-icon">
                  <ShieldCheck size={19} />
                </span>
                <div>
                  <strong>
                    {demo
                      ? "Simulation in progress"
                      : live
                        ? "Telemetry available"
                        : "Awaiting field data"}
                  </strong>
                  <p>
                    {live
                      ? "Readings alone do not determine slope safety."
                      : "Connect your station to begin observation."}
                  </p>
                </div>
              </div>
              <div className="terrain-footer">
                <span>Safety assessment</span>
                <span className="status-tag">Not configured</span>
              </div>
            </section> */}
          </div>
          <div className="bottom-grid">
            {/* <section className="panel" id="modules">
              <div className="panel-heading">
                <div>
                  <h2>Device & modules</h2>
                  <p>Your field station, at a glance.</p>
                </div>
                <CircuitBoard size={19} />
              </div>
              <div className="device-summary">
                <span className="device-chip">
                  <Cpu size={27} />
                </span>
                <div>
                  <strong>ESP32 controller</strong>
                  <p>
                    Wi-Fi access point <span>·</span> Node 01
                  </p>
                </div>
                <span className={"status-tag " + (live ? "green" : "")}>
                  {statusLabel}
                </span>
              </div>
              <div className="module-list">
                {moduleList.map((item) => {
                  const Icon = item.icon;
                  const value = live ? modules[item.key] : undefined;
                  return (
                    <div className="module-row" key={item.key}>
                      <Icon size={16} />
                      <div>
                        {item.name}
                        <small>{item.detail}</small>
                      </div>
                      <span className={"module-status " + (value ? "ok" : "")}>
                        <i />
                        {value === undefined
                          ? "Unknown"
                          : value
                            ? demo
                              ? "Simulated"
                              : "Online"
                            : "Offline"}
                      </span>
                    </div>
                  );
                })}
              </div>
              <div className="device-footer">
                <span>
                  <Signal size={14} />{" "}
                  {rssi === undefined ? "Signal unavailable" : rssi + " dBm"}
                </span>
                <span>
                  Uptime{" "}
                  {uptime === undefined
                    ? "—"
                    : Math.floor(uptime / 60) + " min"}
                </span>
              </div>
            </section> */}
            <section className="panel" id="events">
              <div className="panel-heading">
                <div>
                  <h2>
                    Activity log{" "}
                    <span className="count-pill">{logs.length}</span>
                  </h2>
                  <p>Connection and session events.</p>
                </div>
                <button
                  className="text-button"
                  onClick={() => {
                    setLogs([]);
                    lastEvent.current = "";
                  }}
                  disabled={!logs.length}
                >
                  Clear log
                </button>
              </div>
              <div className="event-list">
                {logs.length ? (
                  logs.slice(0, 5).map((log, index) => (
                    <div className="event" key={log.time + "-" + index}>
                      <span className="event-icon">
                        <Radio size={14} />
                      </span>
                      <div>
                        <p>{log.message}</p>
                        <time>{timeLabel(log.time)}</time>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="events-empty">
                    <Radio size={25} />
                    <h3>Ready when you are.</h3>
                    <p>
                      Device connections and session activity
                      <br />
                      will appear here.
                    </p>
                    <button
                      className="text-button"
                      onClick={() => start(false)}
                    >
                      Connect your ESP32 <ArrowUpRight size={14} />
                    </button>
                  </div>
                )}
              </div>
              <div className="log-footer">
                <span className="tiny-dot" />
                Session only · export readings to keep a copy
              </div>
            </section>
          </div>
          <footer className="page-footer">
            <span>
              <Mountain size={15} /> Dashboard{" "}
              <span className="footer-separator">/</span> Grounded in data.
            </span>
            <span>
              {demo ? "SIMULATED DATA" : "LOCAL MONITORING"}
              <span className="tiny-dot" />
              {now ? timeLabel(now) : "--:--:--"}
            </span>
          </footer>
        </main>
      </div>
      <dialog
        ref={settingsRef}
        className="settings-dialog"
        onCancel={() => setSettings(false)}
        onClose={() => setSettings(false)}
      >
        <form onSubmit={applySettings}>
          <div className="panel-heading">
            <div>
              <h2>Connect your field station</h2>
              <p>ESP32 access point configuration</p>
            </div>
            <button
              type="button"
              className="icon-button"
              aria-label="Close settings"
              onClick={() => setSettings(false)}
            >
              <X size={18} />
            </button>
          </div>
          <div className="settings-body">
            <div className="setup-step">
              <span>1</span>
              <p>
                Join your ESP32 Wi-Fi network from your computer or phone’s
                Wi-Fi settings.
              </p>
            </div>
            <div className="setup-step">
              <span>2</span>
              <p>
                Enter the full URL of your firmware’s JSON readings endpoint.
              </p>
            </div>
            <label className="endpoint-label" htmlFor="endpoint">
              Readings endpoint
            </label>
            <input
              id="endpoint"
              type="url"
              required
              value={draftEndpoint}
              onChange={(event) => setDraftEndpoint(event.target.value)}
              placeholder="http://192.168.4.1/api/readings"
            />
            <p className="settings-hint">
              Keep this Next.js app running locally. The firmware must allow
              cross-origin requests from the dashboard. An HTTPS-hosted
              dashboard may block an HTTP device connection. Use
              http://localhost:3000 and allow local-network access if your
              browser asks. Rain readings are plate wetness, not rainfall rate.
              Calibrate both analog sensors first.
            </p>
            <details>
              <summary>Expected JSON response</summary>
              <pre>
                {JSON.stringify(
                  {
                    sensors: {
                      soilMoisture: 36,
                      rainfall: 2.4,
                      tilt: 3.2,
                      vibration: 0.04,
                    },
                    modules: {
                      // Analog connection health cannot be verified from ADC alone.
                      soilProbe: null,
                      rainGauge: null,
                      imu: true,
                      environment: false,
                      buzzer: false,
                    },
                    uptime: 120,
                    sequence: 240,
                  },
                  null,
                  2,
                )}
              </pre>
            </details>
            {error && (
              <p className="error-message" role="alert">
                {error}
              </p>
            )}
            <button type="submit" className="button primary full-width">
              <RefreshCw size={15} />
              Save & connect
            </button>
          </div>
        </form>
      </dialog>
    </div>
  );
}
