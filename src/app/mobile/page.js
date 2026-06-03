import { Suspense } from "react";
import MobileClient from "./MobileClient";

export default function MobilePage() {
	return (
		<Suspense
			fallback={
				<div className="min-h-screen bg-[radial-gradient(circle_at_top,_#ecfdf3,_#f0f7f5_55%,_#d7ebe6_100%)] px-6 py-10 text-slate-900">
					<div className="mx-auto flex max-w-md flex-col gap-4 rounded-3xl border border-emerald-100 bg-white/90 p-6 shadow-[0_20px_40px_rgba(15,23,42,0.12)]">
						<p className="text-xs uppercase tracking-[0.3em] text-emerald-700">
							Mobile Companion
						</p>
						<p className="text-sm text-slate-600">Loading session...</p>
					</div>
				</div>
			}
		>
			<MobileClient />
		</Suspense>
	);
}
