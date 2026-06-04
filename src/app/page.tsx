"use client";

import { useEffect, useMemo, useState } from "react";
import { io } from "socket.io-client";
import type { Socket } from "socket.io-client";
import QRCodeDisplay from "../components/QRCodeDisplay";
import TerminalScripts from "../components/TerminalScripts";
import TypingConsole from "../components/TypingConsole";

function detectOS(userAgent: string, platform: string) {
  const ua = userAgent.toLowerCase();
  const pf = platform.toLowerCase();
  if (ua.includes("windows") || pf.includes("win")) return "Windows";
  if (ua.includes("mac") || pf.includes("mac")) return "MacOS";
  if (ua.includes("linux") || pf.includes("linux")) return "Linux";
  return "Unknown";
}

function detectBrowser(userAgent: string) {
  const ua = userAgent.toLowerCase();
  if (ua.includes("edg/")) return "Edge";
  if (ua.includes("brave")) return "Brave";
  if (ua.includes("firefox")) return "Firefox";
  if (ua.includes("safari") && !ua.includes("chrome")) return "Safari";
  if (ua.includes("chrome")) return "Chrome";
  return "Unknown";
}

function sanitizeDevicePart(value: string) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 24) ||
    "unknown";
}

function buildDeviceId(osName: string, browserName: string) {
  const osPart = sanitizeDevicePart(osName);
  const browserPart = sanitizeDevicePart(browserName);
  const suffix = Math.random().toString(36).slice(2, 8);
  return `DEVICE_${osPart}_${browserPart}_${suffix}`;
}

const emptyHardwareInfo = {
  laptop_make: "",
  laptop_model: "",
  cpu_model: "",
  ram_gb: "",
  screen_resolution: "",
  battery_status: "",
  wifi_signal_strength: "",
  audio_device_name: "",
  audio_driver_version: "",
  keyboard_layout_locale: "",
};

const emptyParticipant = {
  person_no: "",
  age_range: "",
  gender: "",
  dominant_hand: "",
  years_keyboard_use: "",
  profession_field: "",
  keyboard_type: "",
  room_type: "",
  voip_type: "",
};

export default function Home() {
  const [sessionId, setSessionId] = useState("");
  const [origin, setOrigin] = useState("");
  const [deviceInfo, setDeviceInfo] = useState({ os: "", browser: "" });
  const [deviceId, setDeviceId] = useState("");
  const [hardwareInfo, setHardwareInfo] = useState(emptyHardwareInfo);
  const [participant, setParticipant] = useState(emptyParticipant);
  const [socket, setSocket] = useState<Socket | null>(null);
  const [socketStatus, setSocketStatus] = useState("disconnected");
  const [socketError, setSocketError] = useState("");

  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

  useEffect(() => {
    const ua = navigator.userAgent || "";
    const pf = navigator.platform || "";
    setDeviceInfo({
      os: detectOS(ua, pf),
      browser: detectBrowser(ua),
    });
  }, []);

  useEffect(() => {
    const stored = window.localStorage.getItem("decker_device_id");
    if (stored) {
      setDeviceId(stored);
      return;
    }
    if (!deviceInfo.os && !deviceInfo.browser) return;
    const nextId = buildDeviceId(deviceInfo.os, deviceInfo.browser);
    window.localStorage.setItem("decker_device_id", nextId);
    setDeviceId(nextId);
  }, [deviceInfo]);

  useEffect(() => {
    const socketUrl =
      process.env.NEXT_PUBLIC_SOCKET_URL || window.location.origin;
    const nextSocket = io(socketUrl, {
      path: "/socket.io",
    });
    setSocket(nextSocket);

    const handleConnect = () => {
      setSocketStatus("connected");
      setSocketError("");
      nextSocket.emit("request_session");
    };

    const handleDisconnect = (reason: string) => {
      setSocketStatus("disconnected");
      setSocketError(reason ? `Disconnected: ${reason}` : "");
    };

    const handleConnectError = (error: unknown) => {
      setSocketStatus("error");
      const details =
        typeof error === "object" && error && "description" in error
          ? String(error.description)
          : "";
      const detail =
        details || (error instanceof Error ? error.message : "") ||
        "Socket connection failed";
      setSocketError(detail);
    };

    nextSocket.on("connect", handleConnect);
    nextSocket.on("disconnect", handleDisconnect);
    nextSocket.on("connect_error", handleConnectError);
    nextSocket.on("session_created", (payload) => {
      setSessionId(payload?.sessionId || "");
    });

    return () => {
      nextSocket.off("connect", handleConnect);
      nextSocket.off("disconnect", handleDisconnect);
      nextSocket.off("connect_error", handleConnectError);
      nextSocket.disconnect();
    };
  }, []);

  const qrUrl = useMemo(() => {
    if (!sessionId) return "";
    const base =
      process.env.NEXT_PUBLIC_BASE_URL || origin || "https://YOUR_DOMAIN";
    return `${base}/mobile?session=${encodeURIComponent(sessionId)}`;
  }, [origin, sessionId]);

  const metadata = useMemo(
    () => ({
      session_id: sessionId,
      device_id: deviceId,
      operating_system: deviceInfo.os,
      browser_name: deviceInfo.browser,
      ...hardwareInfo,
      ...participant,
    }),
    [deviceId, deviceInfo, hardwareInfo, participant, sessionId]
  );

  const handleParticipantChange = (
    field: keyof typeof emptyParticipant,
    value: string
  ) => {
    setParticipant((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_#fef3c7,_#f5f2ec_55%,_#e7ddd0_100%)] text-slate-900">
      <main className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-6 py-10 sm:px-10">
        <section className="flex flex-col gap-6 rounded-3xl border border-[var(--panel-border)] bg-[var(--panel)] p-6 shadow-[0_25px_60px_rgba(15,23,42,0.15)] sm:p-10 fade-in">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
            <div className="flex flex-col gap-4">
              <p className="text-xs uppercase tracking-[0.3em] text-[var(--accent)]">
                DECKER+ Dataset Collection
              </p>
              <h1 className="text-3xl font-semibold tracking-tight text-[var(--accent-strong)] sm:text-4xl">
                DECKER+ Dataset Keyboard Recorder
              </h1>
              <p className="max-w-2xl text-sm leading-6 text-slate-700">
                This application records audio snippets around each keystroke
                while you type a standardized paragraph for research purposes.
              </p>
            </div>
            <div className="flex flex-col items-start gap-4 sm:items-end">
              <button
                type="button"
                onClick={() => window.location.reload()}
                className="rounded-full border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-800 shadow-sm transition hover:-translate-y-0.5 hover:border-slate-400"
              >
                Reload Session
              </button>
              <QRCodeDisplay url={qrUrl} />
            </div>
          </div>
        </section>

        <section className="grid gap-6 lg:grid-cols-[1.2fr_1fr] rise-in stagger-1">
          <div className="rounded-3xl border border-slate-200 bg-white/80 p-6 shadow-[0_20px_40px_rgba(15,23,42,0.12)]">
            <h2 className="text-lg font-semibold text-slate-900">
              Device Information
            </h2>
            <p className="mt-1 text-sm text-slate-600">
              Auto-filled from your browser and session handshake.
            </p>
            <div className="mt-4 grid gap-4 sm:grid-cols-3">
              <label className="flex flex-col gap-1 text-xs font-medium uppercase tracking-wide text-slate-500 sm:col-span-3">
                Session ID
                <input
                  readOnly
                  value={sessionId}
                  className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800"
                />
              </label>
              <label className="flex flex-col gap-1 text-xs font-medium uppercase tracking-wide text-slate-500">
                Operating System
                <input
                  readOnly
                  value={deviceInfo.os}
                  className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800"
                />
              </label>
              <label className="flex flex-col gap-1 text-xs font-medium uppercase tracking-wide text-slate-500">
                Browser
                <input
                  readOnly
                  value={deviceInfo.browser}
                  className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800"
                />
              </label>
              <label className="flex flex-col gap-1 text-xs font-medium uppercase tracking-wide text-slate-500">
                Socket Status
                <input
                  readOnly
                  value={socketStatus}
                  className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800"
                />
              </label>
            </div>
            {socketError ? (
              <p className="mt-3 text-xs text-rose-600">{socketError}</p>
            ) : null}
          </div>
          <div className="rounded-3xl border border-slate-200 bg-white/80 p-6 shadow-[0_20px_40px_rgba(15,23,42,0.12)]">
            <h2 className="text-lg font-semibold text-slate-900">
              Consent Form
            </h2>
            <p className="mt-2 text-sm text-slate-700">
              Kindly click on the below link and confirm your consent for your
              participation in this research:
            </p>
            <a
              href="https://forms.gle/Tofq7JNUHpWQ5WJp8"
              target="_blank"
              rel="noreferrer"
              className="mt-4 inline-flex items-center gap-2 rounded-full border border-[var(--accent)] px-4 py-2 text-sm font-semibold text-[var(--accent)] transition hover:bg-[var(--accent)] hover:text-white"
            >
              Consent Form Link
            </a>
          </div>
        </section>

        <section className="rounded-3xl border border-slate-200 bg-white/90 p-6 shadow-[0_20px_40px_rgba(15,23,42,0.12)] rise-in stagger-2">
          <h2 className="text-lg font-semibold text-slate-900">
            System Information
          </h2>
          <TerminalScripts
            hardwareInfo={hardwareInfo}
            onHardwareInfoChange={setHardwareInfo}
          />
        </section>

        <section className="rounded-3xl border border-slate-200 bg-white/90 p-6 shadow-[0_20px_40px_rgba(15,23,42,0.12)]">
          <h2 className="text-lg font-semibold text-slate-900">
            Participant Details
          </h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <label className="flex flex-col gap-2 text-xs font-medium uppercase tracking-wide text-slate-500">
              Person No
              <select
                value={participant.person_no}
                onChange={(event) =>
                  handleParticipantChange("person_no", event.target.value)
                }
                className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
              >
                <option value="">Select</option>
                {[
                  "Person 1",
                  "Person 2",
                  "Person 3",
                  "Person 4",
                  "Person 5",
                ].map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-2 text-xs font-medium uppercase tracking-wide text-slate-500">
              Age Range
              <select
                value={participant.age_range}
                onChange={(event) =>
                  handleParticipantChange("age_range", event.target.value)
                }
                className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
              >
                <option value="">Select</option>
                {[
                  "18-22",
                  "23-27",
                  "28-35",
                  "36-45",
                  "45+",
                ].map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-2 text-xs font-medium uppercase tracking-wide text-slate-500">
              Gender
              <select
                value={participant.gender}
                onChange={(event) =>
                  handleParticipantChange("gender", event.target.value)
                }
                className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
              >
                <option value="">Select</option>
                {["Female", "Male", "Non-binary", "Prefer not to say"].map(
                  (item) => (
                    <option key={item} value={item}>
                      {item}
                    </option>
                  )
                )}
              </select>
            </label>
            <label className="flex flex-col gap-2 text-xs font-medium uppercase tracking-wide text-slate-500">
              Dominant Hand
              <select
                value={participant.dominant_hand}
                onChange={(event) =>
                  handleParticipantChange("dominant_hand", event.target.value)
                }
                className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
              >
                <option value="">Select</option>
                {["Left", "Right", "Ambidextrous"].map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-2 text-xs font-medium uppercase tracking-wide text-slate-500">
              Years Keyboard Use
              <select
                value={participant.years_keyboard_use}
                onChange={(event) =>
                  handleParticipantChange(
                    "years_keyboard_use",
                    event.target.value
                  )
                }
                className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
              >
                <option value="">Select</option>
                {[
                  "Less than 1 year",
                  "1 to 3 years",
                  "3 to 7 years",
                  "7 to 15 years",
                  "More than 15 years",
                ].map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-2 text-xs font-medium uppercase tracking-wide text-slate-500">
              Profession Field
              <select
                value={participant.profession_field}
                onChange={(event) =>
                  handleParticipantChange("profession_field", event.target.value)
                }
                className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
              >
                <option value="">Select</option>
                {[
                  "CS or Engineering",
                  "Sciences",
                  "Humanities",
                  "Management",
                  "Medical",
                  "Other",
                ].map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-2 text-xs font-medium uppercase tracking-wide text-slate-500">
              Keyboard Type
              <select
                value={participant.keyboard_type}
                onChange={(event) =>
                  handleParticipantChange("keyboard_type", event.target.value)
                }
                className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
              >
                <option value="">Select</option>
                {[
                  "built_in_laptop",
                  "external_mechanical",
                  "external_membrane",
                  "Other",
                ].map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-2 text-xs font-medium uppercase tracking-wide text-slate-500">
              Room Type
              <select
                value={participant.room_type}
                onChange={(event) =>
                  handleParticipantChange("room_type", event.target.value)
                }
                className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
              >
                <option value="">Select</option>
                {[
                  "Home",
                  "Office",
                  "Library",
                  "Café",
                  "Lab",
                  "Open hall",
                  "Other",
                ].map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-2 text-xs font-medium uppercase tracking-wide text-slate-500">
              VoIP Type
              <select
                value={participant.voip_type}
                onChange={(event) =>
                  handleParticipantChange("voip_type", event.target.value)
                }
                className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
              >
                <option value="">Select</option>
                {[
                  "Zoom",
                  "Google Meet",
                  "Microsoft Teams",
                  "Cisco Webex",
                  "Zoho Meeting",
                  "Other",
                ].map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </section>

        <section className="rounded-3xl border border-slate-200 bg-white/95 p-6 shadow-[0_20px_40px_rgba(15,23,42,0.12)]">
          <div className="flex flex-col gap-4">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">
                📝 Typing Instructions
              </h2>
              <ol className="mt-3 grid gap-2 text-sm text-slate-700">
                <li>Step 1: Click the "Start Recording" button below.</li>
                <li>Step 2: Start typing directly into the text box. Follow the highlighted text.</li>
                <li>Step 3: Click "Stop Recording" when you have finished the paragraph.</li>
              </ol>
            </div>
          </div>
        </section>

        <TypingConsole
          sessionId={sessionId}
          socket={socket}
          metadata={metadata}
          deviceId={deviceId}
        />
      </main>
    </div>
  );
}