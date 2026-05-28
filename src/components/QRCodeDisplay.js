"use client";

import { useMemo } from "react";

export default function QRCodeDisplay({ url }) {
	const qrSrc = useMemo(() => {
		if (!url) return "";
		return `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(
			url
		)}`;
	}, [url]);

	return (
		<div className="flex w-full flex-col items-center gap-2 rounded-2xl border border-slate-200 bg-white/90 p-4 text-center shadow-sm">
			<p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
				Mobile Pairing
			</p>
			<div className="flex h-40 w-40 items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-slate-50">
				{qrSrc ? (
					<img
						src={qrSrc}
						alt="QR code linking to the mobile session"
						className="h-36 w-36"
						loading="lazy"
					/>
				) : (
					<span className="text-xs text-slate-400">Waiting for session...</span>
				)}
			</div>
			<p className="max-w-[220px] break-words text-[11px] text-slate-500">
				{url || "Session link will appear here."}
			</p>
		</div>
	);
}
