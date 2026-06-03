"use client";

import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { io } from "socket.io-client";

function detectOS(userAgent, platform) {
	const ua = userAgent.toLowerCase();
	const pf = platform.toLowerCase();
	if (ua.includes("windows") || pf.includes("win")) return "Windows";
	if (ua.includes("mac") || pf.includes("mac")) return "MacOS";
	if (ua.includes("linux") || pf.includes("linux")) return "Linux";
	if (ua.includes("android")) return "Android";
	if (ua.includes("iphone") || ua.includes("ipad")) return "iOS";
	return "Unknown";
}

function detectBrowser(userAgent) {
	const ua = userAgent.toLowerCase();
	if (ua.includes("edg/")) return "Edge";
	if (ua.includes("brave")) return "Brave";
	if (ua.includes("firefox")) return "Firefox";
	if (ua.includes("safari") && !ua.includes("chrome")) return "Safari";
	if (ua.includes("chrome")) return "Chrome";
	return "Unknown";
}

function sanitizeDevicePart(value) {
	return String(value || "")
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "")
		.slice(0, 24) || "unknown";
}

function buildDeviceId(osName, browserName) {
	const osPart = sanitizeDevicePart(osName);
	const browserPart = sanitizeDevicePart(browserName);
	const suffix = Math.random().toString(36).slice(2, 8);
	return `DEVICE_${osPart}_${browserPart}_${suffix}`;
}

export default function MobilePage() {
	const searchParams = useSearchParams();
	const sessionId = searchParams.get("session") || "";
	const [status, setStatus] = useState("idle");
	const [message, setMessage] = useState("");
	const [socketStatus, setSocketStatus] = useState("disconnected");
	const [socketError, setSocketError] = useState("");
	const [deviceId, setDeviceId] = useState("");

	const socketRef = useRef(null);
	const streamRef = useRef(null);
	const mediaRecorderRef = useRef(null);
	const chunksRef = useRef([]);
	const recordingRef = useRef(false);

	useEffect(() => {
		const ua = navigator.userAgent || "";
		const pf = navigator.platform || "";
		const stored = window.localStorage.getItem("decker_device_id");
		if (stored) {
			setDeviceId(stored);
			return;
		}
		const nextId = buildDeviceId(detectOS(ua, pf), detectBrowser(ua));
		window.localStorage.setItem("decker_device_id", nextId);
		setDeviceId(nextId);
	}, []);

	useEffect(() => {
		let wakeLock;
		const requestWakeLock = async () => {
			try {
				if (navigator.wakeLock) {
					wakeLock = await navigator.wakeLock.request("screen");
				}
			} catch (error) {
				console.warn("Wake lock not available", error);
			}
		};

		requestWakeLock();

		return () => {
			if (wakeLock) {
				wakeLock.release();
			}
		};
	}, []);

	useEffect(() => {
		const socketUrl =
			process.env.NEXT_PUBLIC_SOCKET_URL || window.location.origin;
		const socket = io(socketUrl, {
			path: "/socket.io",
		});
		socketRef.current = socket;

		socket.on("connect", () => {
			setSocketStatus("connected");
			setSocketError("");
			if (sessionId) {
				socket.emit("join_room", { sessionId });
				setMessage(`Joining session ${sessionId}...`);
			}
		});

		socket.on("disconnect", (reason) => {
			setSocketStatus("disconnected");
			setSocketError(reason ? `Disconnected: ${reason}` : "");
		});

		socket.on("connect_error", (error) => {
			setSocketStatus("error");
			const detail =
				error?.description || error?.message || "Socket connection failed";
			setSocketError(detail);
		});

		socket.on("devices_paired", () => {
			setMessage("Laptop paired. Waiting for recording trigger...");
		});

		socket.on("trigger_recording", () => {
			startRecording();
		});

		socket.on("stop_recording", () => {
			console.log("[mobile] stop_recording received");
			setMessage("Stop command received. Finalizing upload...");
			stopRecording(true);
			socket.emit("stop_recording_ack", { sessionId });
		});

		return () => {
			socket.disconnect();
		};
	}, [sessionId]);

	useEffect(() => {
		if (!sessionId) return;
		if (!socketRef.current?.connected) return;
		socketRef.current.emit("join_room", { sessionId });
		setMessage(`Joining session ${sessionId}...`);
	}, [sessionId]);

	useEffect(() => {
		let cancelled = false;
		if (!navigator?.mediaDevices?.getUserMedia) {
			setMessage("Microphone API unavailable. Use HTTPS or a supported browser.");
			return () => {
				cancelled = true;
			};
		}
		navigator.mediaDevices
			.getUserMedia({
				audio: {
					echoCancellation: false,
					noiseSuppression: false,
					autoGainControl: false,
				},
			})
			.then((stream) => {
				if (cancelled) return;
				streamRef.current = stream;
				const recorder = new MediaRecorder(stream);
				recorder.ondataavailable = (event) => {
					if (event.data && event.data.size > 0) {
						chunksRef.current.push(event.data);
					}
				};
				mediaRecorderRef.current = recorder;
			})
			.catch((error) => {
				console.error("Microphone error", error);
				setMessage("Microphone permission is required.");
			});

		return () => {
			cancelled = true;
			streamRef.current?.getTracks().forEach((track) => track.stop());
		};
	}, []);

	const startRecording = () => {
		if (!mediaRecorderRef.current) return;
		if (recordingRef.current) return;
		if (mediaRecorderRef.current?.state === "recording") return;
		chunksRef.current = [];
		mediaRecorderRef.current.start(1000);
		setStatus("recording");
		recordingRef.current = true;
		setMessage("Recording on mobile device...");
	};

	const stopRecording = async (forceStop = false) => {
		if (!forceStop && status !== "recording") return;
		if (
			!forceStop &&
			!recordingRef.current &&
			mediaRecorderRef.current?.state !== "recording"
		) {
			return;
		}

		recordingRef.current = false;
		if (mediaRecorderRef.current?.state === "recording") {
			await new Promise((resolve) => {
				mediaRecorderRef.current.onstop = resolve;
				mediaRecorderRef.current.stop();
			});
		}

		const audioBlob = new Blob(chunksRef.current, {
			type: "audio/webm",
		});

		const formData = new FormData();
		formData.append("sessionId", sessionId);
		formData.append("device", "mobile");
		formData.append("device_id", deviceId || "unknown-device");
		formData.append(
			"audio",
			audioBlob,
			`mobile_audio_${sessionId || "unknown"}.webm`
		);

		try {
			const response = await fetch("/api/upload", {
				method: "POST",
				body: formData,
			});
			if (!response.ok) {
				throw new Error("Upload failed");
			}
			setMessage("Mobile upload completed.");
		} catch (error) {
			console.error("Upload error", error);
			setMessage("Mobile upload failed. Please retry.");
		}

		setStatus("idle");
	};

	return (
		<div className="min-h-screen bg-[radial-gradient(circle_at_top,_#ecfdf3,_#f0f7f5_55%,_#d7ebe6_100%)] px-6 py-10 text-slate-900">
			<div className="mx-auto flex max-w-md flex-col gap-6 rounded-3xl border border-emerald-100 bg-white/90 p-6 shadow-[0_20px_40px_rgba(15,23,42,0.12)]">
				<p className="text-xs uppercase tracking-[0.3em] text-emerald-700">
					Mobile Companion
				</p>
				<h1 className="flex flex-col gap-2 text-2xl font-semibold text-slate-900">
					<span>Session</span>
					<span className="break-all text-base font-semibold text-slate-800 sm:text-lg">
						{sessionId || "Not Linked"}
					</span>
				</h1>
				<div className="flex items-center gap-3">
					<span
						className={`h-4 w-4 rounded-full ${
							status === "recording"
								? "bg-emerald-500 shadow-[0_0_14px_rgba(16,185,129,0.7)] animate-pulse"
								: "bg-slate-300"
						}`}
					/>
					<p className="text-sm font-medium text-slate-700">
						{status === "recording"
							? "Microphone is RECORDING"
							: "Microphone is IDLE"}
					</p>
				</div>
				<p className="rounded-2xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
					{message || "Waiting for laptop connection..."}
				</p>
				<p className="text-xs text-slate-500">
					Socket: {socketStatus}
					{socketError ? ` (${socketError})` : ""}
				</p>
				<p className="text-xs text-slate-500">
					Keep this screen awake during recording. Wake lock is requested
					automatically.
				</p>
			</div>
		</div>
	);
}
