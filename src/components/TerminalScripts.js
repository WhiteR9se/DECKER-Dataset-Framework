"use client";

import { useMemo, useState } from "react";

const windowsScript = [
	"$ErrorActionPreference = 'SilentlyContinue'",
	"$cs = Get-CimInstance Win32_ComputerSystem",
	"$make = $cs.Manufacturer",
	"$model = $cs.Model",
	"$cpu = (Get-CimInstance Win32_Processor | Select-Object -First 1).Name",
	"$ram = [math]::Round($cs.TotalPhysicalMemory / 1GB)",
	"$vid = Get-CimInstance Win32_VideoController | Select-Object -First 1",
	"$screen = if ($vid) { \"$($vid.CurrentHorizontalResolution)x$($vid.CurrentVerticalResolution)\" } else { \"Unknown\" }",
	"$batt = Get-CimInstance Win32_Battery | Select-Object -First 1",
	"$batteryStatus = if ($batt) { switch ($batt.BatteryStatus) { 2 {\"AC Power\"}; 1 {\"On Battery\"}; default {\"Charging\"} } } else { \"AC Power / No Battery\" }",
	"$wifi = (netsh wlan show interfaces | Select-String \"Signal\" | ForEach-Object { $_.Line.Split(\":\")[1].Trim() })",
	"if ([string]::IsNullOrWhiteSpace($wifi)) { $wifi = \"Not Connected\" }",
	"$audioDev = Get-CimInstance Win32_SoundDevice | Select-Object -First 1",
	"$audioName = if ($audioDev) { $audioDev.Name } else { \"Unknown\" }",
	"$audioDriver = if ($audioDev) { (Get-CimInstance Win32_PnPSignedDriver | Where-Object { $_.DeviceName -eq $audioName } | Select-Object -First 1).DriverVersion } else { \"Unknown\" }",
	"if ([string]::IsNullOrWhiteSpace($audioDriver)) { $audioDriver = \"Standard/Unknown\" }",
	"$locale = (Get-WinUserLanguageList)[0].LanguageTag",
	"Write-Host \"`n`n`n`n<----------------OUTPUTS-------------------->`n`n\"",
	"Write-Host \"Make:                  $make\"",
	"Write-Host \"Model Name:            $model\"",
	"Write-Host \"CPU Model:             $cpu\"",
	"Write-Host \"RAM (GB):              $ram\"",
	"Write-Host \"Screen Resolution:     $screen\"",
	"Write-Host \"Battery Status:        $batteryStatus\"",
	"Write-Host \"Wi-Fi Signal Strength: $wifi\"",
	"Write-Host \"Audio Device:          $audioName\"",
	"Write-Host \"Audio Driver Version:  $audioDriver\"",
	"Write-Host \"Keyboard Locale:       $locale\"",
	"Write-Host \"`n`n>>>Kindly copy the above output and paste it into the text box in the website\"",
].join("\n");

const linuxScript = [
	"#!/bin/bash",
	"make=$(cat /sys/class/dmi/id/sys_vendor 2>/dev/null || echo \"Unknown\")",
	"model=$(cat /sys/class/dmi/id/product_name 2>/dev/null || echo \"Unknown\")",
	"cpu=$(grep -m 1 'model name' /proc/cpuinfo | cut -d: -f2 | sed 's/^ *//')",
	"ram=$(awk '/MemTotal/ {printf \"%.0f\", $2/1024/1024}' /proc/meminfo)",
	"screen=$(xrandr 2>/dev/null | awk '/\\*/ {print $1; exit}')",
	"[ -z \"$screen\" ] && screen=\"Unknown (Wayland/Headless)\"",
	"batteryStatus=$(cat /sys/class/power_supply/BAT*/status 2>/dev/null | head -n 1)",
	"[ -z \"$batteryStatus\" ] && batteryStatus=\"AC Power / No Battery\"",
	"wifi=$(nmcli -t -f IN-USE,SIGNAL dev wifi 2>/dev/null | grep '^\\*' | cut -d: -f2 | sed 's/$/%/')",
	"[ -z \"$wifi\" ] && wifi=\"Not Connected\"",
	"audioName=$(lspci 2>/dev/null | grep -i audio | head -n 1 | cut -d: -f3 | sed 's/^ *//')",
	"[ -z \"$audioName\" ] && audioName=\"Unknown\"",
	"audioDriver=$(lspci -k 2>/dev/null | grep -iA 2 audio | grep 'Kernel modules' | head -n 1 | cut -d: -f2 | sed 's/^ *//')",
	"[ -z \"$audioDriver\" ] && audioDriver=\"Standard/Unknown\"",
	"locale=$(localectl status 2>/dev/null | grep \"X11 Layout\" | cut -d: -f2 | sed 's/^ *//')",
	"[ -z \"$locale\" ] && locale=$LANG",
	"echo -e \"\\n\\n\\n\\n<----------------OUTPUTS-------------------->\\n\\n\"",
	"echo \"Make:                  $make\"",
	"echo \"Model Name:            $model\"",
	"echo \"CPU Model:             $cpu\"",
	"echo \"RAM (GB):              $ram\"",
	"echo \"Screen Resolution:     $screen\"",
	"echo \"Battery Status:        $batteryStatus\"",
	"echo \"Wi-Fi Signal Strength: $wifi\"",
	"echo \"Audio Device:          $audioName\"",
	"echo \"Audio Driver Version:  $audioDriver\"",
	"echo \"Keyboard Locale:       $locale\"",
	"echo -e \"\\n\\n>>>Kindly copy the above output and paste it into the text box in the website\"",
].join("\n");

const macScript = [
	"make=\"Apple\"",
	"model=$(sysctl -n hw.model)",
	"cpu=$(sysctl -n machdep.cpu.brand_string 2>/dev/null || echo \"Apple Silicon\")",
	"ram=$(( $(sysctl -n hw.memsize) / 1073741824 ))",
	"screen=$(system_profiler SPDisplaysDataType 2>/dev/null | awk '/Resolution:/ {print $2, $3, $4; exit}')",
	"[ -z \"$screen\" ] && screen=\"Unknown\"",
	"batteryStatus=$(pmset -g batt | awk 'NR==2 {print $4}' | tr -d ';')",
	"[ -z \"$batteryStatus\" ] && batteryStatus=\"AC Power / Desktop\"",
	"wifi_dbm=$(/System/Library/PrivateFrameworks/Apple80211.framework/Resources/airport -I 2>/dev/null | awk -F': ' '/agrCtlRSSI/ {print $2}')",
	"if [ -n \"$wifi_dbm\" ]; then wifi=\"${wifi_dbm} dBm\"; else wifi=\"Not Connected\"; fi",
	"audioName=$(system_profiler SPAudioDataType 2>/dev/null | awk '/Devices:/{getline; print}' | sed 's/^[ \t]*//' | cut -d: -f1)",
	"[ -z \"$audioName\" ] && audioName=\"Apple Audio Device\"",
	"audioDriver=\"CoreAudio (Native)\"",
	"locale=$(defaults read ~/Library/Preferences/com.apple.HIToolbox.plist AppleSelectedInputSources 2>/dev/null | awk -F'\"' '/KeyboardLayout Name/ {print $4}')",
	"[ -z \"$locale\" ] && locale=\"Unknown\"",
	"echo -e \"\\n\\n\\n\\n<----------------OUTPUTS-------------------->\\n\\n\"",
	"echo \"Make:                  $make\"",
	"echo \"Model Name:            $model\"",
	"echo \"CPU Model:             $cpu\"",
	"echo \"RAM (GB):              $ram\"",
	"echo \"Screen Resolution:     $screen\"",
	"echo \"Battery Status:        $batteryStatus\"",
	"echo \"Wi-Fi Signal Strength: $wifi\"",
	"echo \"Audio Device:          $audioName\"",
	"echo \"Audio Driver Version:  $audioDriver\"",
	"echo \"Keyboard Locale:       $locale\"",
	"echo -e \"\\n\\n>>>Kindly copy the above output and paste it into the text box in the website\"",
].join("\n");

const fieldConfig = [
	{ key: "laptop_make", label: "Laptop Make" },
	{ key: "laptop_model", label: "Laptop Model" },
	{ key: "cpu_model", label: "CPU Model" },
	{ key: "ram_gb", label: "RAM (GB)" },
	{ key: "screen_resolution", label: "Screen Resolution" },
	{ key: "battery_status", label: "Battery Status" },
	{ key: "wifi_signal_strength", label: "Wi-Fi Signal Strength" },
	{ key: "audio_device_name", label: "Audio Device" },
	{ key: "audio_driver_version", label: "Audio Driver Version" },
	{ key: "keyboard_layout_locale", label: "Keyboard Locale" },
];

const parsePatterns = {
	laptop_make: /Make:\s+(.*)/i,
	laptop_model: /Model Name:\s+(.*)/i,
	cpu_model: /CPU Model:\s+(.*)/i,
	ram_gb: /RAM \(GB\):\s+(.*)/i,
	screen_resolution: /Screen Resolution:\s+(.*)/i,
	battery_status: /Battery Status:\s+(.*)/i,
	wifi_signal_strength: /Wi-?Fi Signal Strength:\s+(.*)/i,
	audio_device_name: /Audio Device:\s+(.*)/i,
	audio_driver_version: /Audio Driver Version:\s+(.*)/i,
	keyboard_layout_locale: /Keyboard Locale:\s+(.*)/i,
};

const fallbackCopy = (text) => {
	const textarea = document.createElement("textarea");
	textarea.value = text;
	textarea.setAttribute("readonly", "");
	textarea.style.position = "absolute";
	textarea.style.left = "-9999px";
	document.body.appendChild(textarea);
	textarea.select();
	const ok = document.execCommand("copy");
	document.body.removeChild(textarea);
	return ok;
};

export default function TerminalScripts({
	hardwareInfo,
	onHardwareInfoChange,
}) {
	const [rawOutput, setRawOutput] = useState("");
	const [copied, setCopied] = useState("");

	const scripts = useMemo(
		() => [
			{ label: "Windows", value: windowsScript },
			{ label: "Linux", value: linuxScript },
			{ label: "Mac", value: macScript },
		],
		[]
	);

	const handleCopy = async (label, script) => {
		try {
			if (navigator.clipboard?.writeText) {
				await navigator.clipboard.writeText(script);
			} else {
				const ok = fallbackCopy(script);
				if (!ok) {
					throw new Error("Clipboard fallback failed");
				}
			}
			setCopied(label);
			setTimeout(() => setCopied(""), 2000);
		} catch (error) {
			console.error("Clipboard copy failed", error);
		}
	};

	const parseOutput = (text) => {
		const nextInfo = { ...hardwareInfo };
		Object.entries(parsePatterns).forEach(([key, pattern]) => {
			const match = text.match(pattern);
			if (match && match[1]) {
				nextInfo[key] = match[1].trim();
			}
		});
		onHardwareInfoChange(nextInfo);
	};

	const handleOutputChange = (event) => {
		const text = event.target.value;
		setRawOutput(text);
		parseOutput(text);
	};

	return (
		<div className="mt-4 flex flex-col gap-5 text-sm text-slate-700">
			<div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
				<p className="font-medium text-slate-800">Instructions:</p>
				<ol className="mt-2 grid gap-1 text-sm text-slate-700">
					<li>
						1. Click on the button which corresponds to your Operating System.
						It will copy the terminal script to your clipboard.
					</li>
					<li>
						2. Open your bash/zsh terminal (Linux/macOS) or PowerShell in
						administrator mode (Windows).
					</li>
					<li>
						3. Copy the output of the script and paste it in the text box below.
					</li>
				</ol>
			</div>

			<div className="flex flex-wrap gap-3">
				{scripts.map((item) => (
					<button
						key={item.label}
						type="button"
						onClick={() => handleCopy(item.label, item.value)}
						className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-800 transition hover:-translate-y-0.5 hover:border-slate-300"
					>
						{item.label}
						{copied === item.label ? " ✓ Copied" : ""}
					</button>
				))}
			</div>

			<textarea
				rows={6}
				value={rawOutput}
				onChange={handleOutputChange}
				placeholder="Paste the terminal output here..."
				className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-800"
			/>

			<div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
				{fieldConfig.map((field) => (
					<label
						key={field.key}
						className="flex flex-col gap-1 text-xs font-medium uppercase tracking-wide text-slate-500"
					>
						{field.label}
						<input
							value={hardwareInfo[field.key] || ""}
							onChange={(event) =>
								onHardwareInfoChange({
									...hardwareInfo,
									[field.key]: event.target.value,
								})
							}
							className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800"
						/>
					</label>
				))}
			</div>
		</div>
	);
}
