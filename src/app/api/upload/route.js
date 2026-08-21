import { promises as fsp } from "fs";
import path from "path";
import os from "os";
import { execFile } from "child_process";
import {
	ensureFolder,
	downloadFileText,
	findFileId,
	getDriveClient,
	upsertTextFile,
	uploadFileFromPath,
} from "../../../lib/googleDriveClient";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const uploadRoot = path.join(os.tmpdir(), "decker_sessions");
const manifestFile = "manifest.json";
const processingLock = "processing.lock";
const defaultDriveParentId = "1VlFQjn2t-H7_cihRnjmjNjMK3lGt-5xN";
const pythonPath = process.env.PYTHON_PATH || "python3";
const masterCsvName = "master_sessions.csv";

const masterFields = [
	"session_id",
	"device_id",
	"operating_system",
	"browser_name",
	"laptop_make",
	"laptop_model",
	"cpu_model",
	"ram_gb",
	"screen_resolution",
	"battery_status",
	"wifi_signal_strength",
	"audio_device_name",
	"audio_driver_version",
	"keyboard_layout_locale",
	"person_no",
	"age_range",
	"gender",
	"dominant_hand",
	"years_keyboard_use",
	"profession_field",
	"keyboard_type",
	"room_type",
	"voip_type",
	"noise_cancellation",
	"microphone_mode",
];

const log = (...args) => {
	console.log("[upload]", ...args);
};

const execFileAsync = (command, args) =>
	new Promise((resolve, reject) => {
		execFile(command, args, (error, stdout, stderr) => {
			if (error) {
				reject({ error, stdout, stderr });
				return;
			}
			resolve({ stdout, stderr });
		});
	});

const ensureDir = async (dirPath) => {
	await fsp.mkdir(dirPath, { recursive: true });
};

const readManifest = async (sessionDir) => {
	try {
		const data = await fsp.readFile(path.join(sessionDir, manifestFile), "utf8");
		return JSON.parse(data);
	} catch (error) {
		return { sessionId: null, deviceId: null };
	}
};

const writeManifest = async (sessionDir, manifest) => {
	await fsp.writeFile(
		path.join(sessionDir, manifestFile),
		JSON.stringify(manifest, null, 2)
	);
};

const deriveExtension = (fileName) => {
	const ext = path.extname(fileName || "").toLowerCase();
	return ext || ".webm";
};

const sanitizeDriveName = (value) => {
	const safe = String(value || "")
		.replace(/[\\/?%*:|"<>]/g, "-")
		.replace(/\s+/g, "-")
		.replace(/-+/g, "-")
		.replace(/^-+|-+$/g, "");
	return safe.slice(0, 64) || "unknown-device";
};

const parseMetadataCsv = async (csvPath) => {
	const text = await fsp.readFile(csvPath, "utf8");
	const lines = text.split(/\r?\n/);
	const metadata = {};

	for (const line of lines) {
		if (!line.trim()) {
			break;
		}
		if (line.startsWith("metadata_key")) {
			continue;
		}
		if (line.startsWith("action,")) {
			break;
		}
		const commaIndex = line.indexOf(",");
		if (commaIndex === -1) {
			continue;
		}
		const key = line.slice(0, commaIndex).trim();
		const value = line.slice(commaIndex + 1).trim();
		metadata[key] = value;
	}

	return metadata;
};

const escapeCsvValue = (value) => {
	const raw = String(value ?? "");
	if (/[",\n]/.test(raw)) {
		return `"${raw.replace(/"/g, '""')}"`;
	}
	return raw;
};

const buildMasterCsv = (existingText, rowValues) => {
	const headerLine = ["row_id", ...masterFields].join(",");
	if (!existingText) {
		const rowLine = [
			"1",
			...rowValues.map(escapeCsvValue),
		].join(",");
		return [headerLine, rowLine].join("\n");
	}

	const lines = existingText.split(/\r?\n/).filter((line) => line.length > 0);
	const hasHeader = lines.length > 0 && lines[0].startsWith("row_id,");
	const dataLines = hasHeader ? lines.slice(1) : lines;
	const nextIndex = dataLines.length + 1;
	const rowLine = [
		String(nextIndex),
		...rowValues.map(escapeCsvValue),
	].join(",");
	return [headerLine, ...dataLines, rowLine].join("\n");
};

const saveFormFile = async (file, targetPath) => {
	const buffer = Buffer.from(await file.arrayBuffer());
	await fsp.writeFile(targetPath, buffer);
};

const hasRequiredFiles = (manifest) =>
	Boolean(manifest.laptopAudio && manifest.mobileAudio && manifest.metadataCsv);

const createSessionFolder = async (drive, sessionId, deviceId) => {
	const parentId =
		process.env.DRIVE_PARENT_FOLDER_ID || defaultDriveParentId || null;
	const shouldCreate =
		(process.env.DRIVE_CREATE_SESSION_FOLDER ?? "true") === "true";
	if (!shouldCreate) {
		return parentId;
	}

	const safeDeviceId = sanitizeDriveName(deviceId || "unknown-device");
	const safeSessionId = sanitizeDriveName(sessionId || "unknown-session");

	if (!parentId) {
		const deviceFolderId = await ensureFolder(drive, "root", safeDeviceId);
		return ensureFolder(drive, deviceFolderId, safeSessionId);
	}

	const deviceFolderId = await ensureFolder(drive, parentId, safeDeviceId);
	return ensureFolder(drive, deviceFolderId, safeSessionId);
};

const cleanupSession = async (sessionDir) => {
	const files = await fsp.readdir(sessionDir);
	await Promise.all(
		files.map((file) => fsp.unlink(path.join(sessionDir, file)))
	);
	await fsp.rmdir(sessionDir);
};

const processSession = async (sessionDir, manifest) => {
	const scriptPath = path.join(
		process.cwd(),
		"src",
		"python_scripts",
		"sync_audio.py"
	);

	const laptopPath = path.join(sessionDir, manifest.laptopAudio);
	const mobilePath = path.join(sessionDir, manifest.mobileAudio);

	log("Starting sync", manifest.sessionId);
	log("Laptop input", laptopPath);
	log("Mobile input", mobilePath);
	log("Python", pythonPath);

	const { stdout, stderr } = await execFileAsync(pythonPath, [
		scriptPath,
		sessionDir,
		manifest.sessionId,
		laptopPath,
		mobilePath,
	]);
	if (stdout) log("Python stdout", stdout.trim());
	if (stderr) log("Python stderr", stderr.trim());

	const syncedLaptop = path.join(
		sessionDir,
		`${manifest.sessionId}_laptop_synced.wav`
	);
	const syncedMobile = path.join(
		sessionDir,
		`${manifest.sessionId}_mobile_synced.wav`
	);
	const metadataCsv = path.join(sessionDir, manifest.metadataCsv);

	const drive = getDriveClient();
	const folderId = await createSessionFolder(
		drive,
		manifest.sessionId,
		manifest.deviceId
	);
	log("Drive folder", folderId || "root");

	const laptopId = await uploadFileFromPath(
		drive,
		folderId,
		syncedLaptop,
		path.basename(syncedLaptop),
		"audio/wav"
	);
	log("Uploaded laptop", laptopId);

	const mobileId = await uploadFileFromPath(
		drive,
		folderId,
		syncedMobile,
		path.basename(syncedMobile),
		"audio/wav"
	);
	log("Uploaded mobile", mobileId);

	const csvId = await uploadFileFromPath(
		drive,
		folderId,
		metadataCsv,
		path.basename(metadataCsv),
		"text/csv"
	);
	log("Uploaded csv", csvId);

	const metadata = await parseMetadataCsv(metadataCsv);
	const rowValues = masterFields.map((field) => metadata[field] || "");
	const masterParentId =
		process.env.DRIVE_PARENT_FOLDER_ID || defaultDriveParentId || "root";
	const existingMasterId = await findFileId(
		drive,
		masterParentId,
		masterCsvName
	);
	const existingText = existingMasterId
		? await downloadFileText(drive, existingMasterId)
		: "";
	const nextMasterText = buildMasterCsv(existingText, rowValues);
	const masterId = await upsertTextFile(
		drive,
		masterParentId,
		masterCsvName,
		nextMasterText
	);
	log("Master csv updated", masterId);

	await cleanupSession(sessionDir);
	log("Cleanup complete", manifest.sessionId);
};

const maybeStartProcessing = async (sessionDir, manifest) => {
	if (!hasRequiredFiles(manifest)) return;

	const lockPath = path.join(sessionDir, processingLock);
	try {
		await fsp.access(lockPath);
		return;
	} catch (error) {
		await fsp.writeFile(lockPath, "processing");
	}

	processSession(sessionDir, manifest).catch((error) => {
		console.error("Session processing failed", error);
	});
};

export async function POST(request) {
	try {
		const formData = await request.formData();
		const sessionId = formData.get("sessionId") || "unknown";
		const device = formData.get("device") || "unknown";
		const deviceId = formData.get("device_id") || "unknown-device";
		const audioFile = formData.get("audio");
		const csvFile = formData.get("metadata_csv");

		log("Incoming upload", { sessionId, device, deviceId });

		if (!audioFile || typeof audioFile.arrayBuffer !== "function") {
			return Response.json(
				{ ok: false, error: "Missing audio file" },
				{ status: 400 }
			);
		}

		const sessionDir = path.join(uploadRoot, sessionId);
		await ensureDir(sessionDir);

		const manifest = await readManifest(sessionDir);
		manifest.sessionId = sessionId;
		if (
			device === "laptop" ||
			!manifest.deviceId ||
			manifest.deviceId === "unknown-device"
		) {
			manifest.deviceId = deviceId;
		}

		if (device === "laptop") {
			const ext = deriveExtension(audioFile.name);
			const audioName = `laptop_input${ext}`;
			await saveFormFile(audioFile, path.join(sessionDir, audioName));
			manifest.laptopAudio = audioName;
			log("Saved laptop audio", audioName);

			if (csvFile && typeof csvFile.arrayBuffer === "function") {
				const csvName = "metadata.csv";
				await saveFormFile(csvFile, path.join(sessionDir, csvName));
				manifest.metadataCsv = csvName;
				log("Saved metadata csv", csvName);
			}
		} else if (device === "mobile") {
			const ext = deriveExtension(audioFile.name);
			const audioName = `mobile_input${ext}`;
			await saveFormFile(audioFile, path.join(sessionDir, audioName));
			manifest.mobileAudio = audioName;
			log("Saved mobile audio", audioName);
		}

		const latestManifest = await readManifest(sessionDir);
		const mergedManifest = {
			...latestManifest,
			...manifest,
		};
		if (
			device === "mobile" &&
			latestManifest.deviceId &&
			latestManifest.deviceId !== "unknown-device"
		) {
			mergedManifest.deviceId = latestManifest.deviceId;
		}

		await writeManifest(sessionDir, mergedManifest);
		await maybeStartProcessing(sessionDir, mergedManifest);

		return Response.json({ ok: true, sessionId, device });
	} catch (error) {
		console.error("Upload handler error", error);
		return Response.json(
			{ ok: false, error: "Invalid upload" },
			{ status: 400 }
		);
	}
}
