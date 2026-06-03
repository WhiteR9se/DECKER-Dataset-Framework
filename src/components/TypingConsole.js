"use client";

import { useEffect, useMemo, useRef, useState } from "react";

function buildCsv(metadata, keystrokes) {
	const metadataRows = Object.entries(metadata).map(([key, value]) =>
		`${key},${String(value ?? "").replace(/\n/g, " ")}`
	);

	const keystrokeRows = keystrokes.map(
		(entry) =>
			`${entry.action},${entry.key.replace(/\n/g, " ")},${entry.timestamp_ms}`
	);

	return [
		"metadata_key,metadata_value",
		...metadataRows,
		"",
		"action,key,timestamp_ms",
		...keystrokeRows,
	].join("\n");
}

export default function TypingConsole({ sessionId, socket, metadata, deviceId }) {
	const [status, setStatus] = useState("idle");
	const [typedText, setTypedText] = useState("");
	const [micError, setMicError] = useState("");
	const [lastUpload, setLastUpload] = useState("");
	const isSocketReady = Boolean(socket && socket.connected);

	const streamRef = useRef(null);
	const mediaRecorderRef = useRef(null);
	const chunksRef = useRef([]);
	const keystrokesRef = useRef([]);
	const beepTimeRef = useRef(null);
	const beepTimeoutRef = useRef(null);
	const recordingRef = useRef(false);

	useEffect(() => {
		let cancelled = false;

		if (!navigator?.mediaDevices?.getUserMedia) {
			setMicError("Microphone API unavailable. Use HTTPS or a supported browser.");
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
				setMicError("Microphone access is required for recording.");
			});

		return () => {
			cancelled = true;
			if (beepTimeoutRef.current) {
				clearTimeout(beepTimeoutRef.current);
			}
			streamRef.current?.getTracks().forEach((track) => track.stop());
		};
	}, []);

	useEffect(() => {
		if (!socket) return undefined;

		const handleTrigger = () => {
			startRecording();
		};
		const handleStop = () => {
			stopRecording(true);
		};

		socket.on("trigger_recording", handleTrigger);
		socket.on("stop_recording", handleStop);

		return () => {
			socket.off("trigger_recording", handleTrigger);
			socket.off("stop_recording", handleStop);
		};
	}, [socket]);

	const statusLabel = useMemo(() => {
		if (status === "recording") return "Recording in progress";
		return "Microphone idle";
	}, [status]);

	const playBeep = () => {
		const AudioContext = window.AudioContext || window.webkitAudioContext;
		if (!AudioContext) return;

		const audioContext = new AudioContext();
		const oscillator = audioContext.createOscillator();
		const gain = audioContext.createGain();

		oscillator.type = "sine";
		oscillator.frequency.setValueAtTime(3000, audioContext.currentTime);
		gain.gain.setValueAtTime(0.15, audioContext.currentTime);

		oscillator.connect(gain);
		gain.connect(audioContext.destination);
		oscillator.start();
		beepTimeRef.current = performance.now();

		setTimeout(() => {
			oscillator.stop();
			audioContext.close();
		}, 50);
	};

	const startRecording = () => {
		if (!sessionId) return;
		if (recordingRef.current) return;
		if (mediaRecorderRef.current?.state === "recording") return;
		if (!mediaRecorderRef.current) {
			setMicError("Microphone is not ready yet.");
			return;
		}

		chunksRef.current = [];
		keystrokesRef.current = [];
		beepTimeRef.current = null;
		mediaRecorderRef.current.start(1000);
		setStatus("recording");
		recordingRef.current = true;
		setLastUpload("");

		if (beepTimeoutRef.current) {
			clearTimeout(beepTimeoutRef.current);
		}
		beepTimeoutRef.current = setTimeout(() => {
			playBeep();
		}, 1000);
	};

	const stopRecording = async (remoteStop = false) => {
		if (status !== "recording") return;
		recordingRef.current = false;
		if (beepTimeoutRef.current) {
			clearTimeout(beepTimeoutRef.current);
		}

		if (!remoteStop) {
			socket?.emit("stop_recording_command", { sessionId });
		}

		if (mediaRecorderRef.current?.state === "recording") {
			await new Promise((resolve) => {
				mediaRecorderRef.current.onstop = resolve;
				mediaRecorderRef.current.stop();
			});
		}

		const audioBlob = new Blob(chunksRef.current, {
			type: "audio/webm",
		});

		const csv = buildCsv(metadata, keystrokesRef.current);
		const formData = new FormData();
		formData.append("sessionId", sessionId);
		formData.append("device", "laptop");
		formData.append("device_id", deviceId || "unknown-device");
		formData.append(
			"metadata_csv",
			new Blob([csv], { type: "text/csv" }),
			`metadata_${sessionId}.csv`
		);
		formData.append(
			"audio",
			audioBlob,
			`laptop_audio_${sessionId}.webm`
		);

		try {
			const response = await fetch("/api/upload", {
				method: "POST",
				body: formData,
			});

			if (!response.ok) {
				throw new Error("Upload failed");
			}
			setLastUpload("Laptop upload completed.");
		} catch (error) {
			console.error("Upload error", error);
			setLastUpload("Upload failed. Please try again.");
		}

		setStatus("idle");
	};

	const handleKeyEvent = (event, action) => {
		if (status !== "recording") return;
		if (event.repeat) return;
		if (!beepTimeRef.current) return;

		const timestamp = performance.now() - beepTimeRef.current;
		keystrokesRef.current.push({
			action,
			key: event.key,
			timestamp_ms: Math.round(timestamp),
		});
	};

	return (
		<section className="rounded-3xl border border-slate-200 bg-white/95 p-6 shadow-[0_20px_40px_rgba(15,23,42,0.12)]">
			<div className="flex flex-col gap-4">
				<div>
					<h2 className="text-lg font-semibold text-slate-900">TYPING BOX</h2>
					<p className="mt-1 text-sm text-slate-600">
						Click inside and start typing after you hear a beep after you have
						clicked "Start Recording".
					</p>
				</div>

				<div className="flex flex-wrap gap-3">
					<button
						type="button"
						onClick={() => {
							startRecording();
							socket?.emit("start_recording_command", { sessionId });
						}}
						disabled={!sessionId || !isSocketReady}
						className="rounded-full bg-[var(--accent)] px-5 py-2 text-sm font-semibold text-white transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-50"
					>
						Start Recording
					</button>
					<button
						type="button"
						onClick={() => stopRecording(false)}
						disabled={!sessionId || !isSocketReady}
						className="rounded-full border border-slate-200 bg-white px-5 py-2 text-sm font-semibold text-slate-700 transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-50"
					>
						Stop Recording
					</button>
					<button
						type="button"
						onClick={() => {
							setTypedText("");
							if (status !== "recording") {
								keystrokesRef.current = [];
							}
						}}
						className="rounded-full border border-slate-200 bg-white px-5 py-2 text-sm font-semibold text-slate-700 transition hover:-translate-y-0.5"
					>
						Clear Box
					</button>
				</div>

				<div className="flex items-center gap-3 text-xs text-slate-600">
					<span
						className={`h-3 w-3 rounded-full ${
							status === "recording"
								? "bg-emerald-500 shadow-[0_0_12px_rgba(16,185,129,0.7)] animate-pulse"
								: "bg-slate-300"
						}`}
					/>
					<span>{statusLabel}</span>
					<span>
						{isSocketReady ? "Socket connected" : "Socket not connected"}
					</span>
					{micError ? <span className="text-rose-600">{micError}</span> : null}
					{lastUpload ? <span className="text-emerald-700">{lastUpload}</span> : null}
				</div>

				<textarea
					rows={8}
					value={typedText}
					onChange={(event) => setTypedText(event.target.value)}
					onKeyDown={(event) => handleKeyEvent(event, "down")}
					onKeyUp={(event) => handleKeyEvent(event, "up")}
					className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 text-sm text-slate-800"
					placeholder="Start typing here..."
				/>

				<p className="text-xs uppercase tracking-[0.2em] text-slate-400">
					For Research Purposes Only. Thank You For Your Participation.
				</p>
			</div>
		</section>
	);
}
