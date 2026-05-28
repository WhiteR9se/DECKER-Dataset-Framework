# DECKER+ Dataset Keyboard Recorder

DECKER+ is a dual-device data collection app for synchronized laptop keystrokes and audio, plus mobile audio capture. It uses a custom Next.js server with Socket.io for real-time pairing and recording triggers. The pipeline records keystrokes + audio, aligns laptop/mobile audio with a sync beep in Python, and uploads synchronized files to Google Drive.

## What This Builds

- Laptop dashboard for session setup, device metadata, participant details, and typing capture.
- Mobile companion page that pairs via QR and records phone audio.
- Backend upload pipeline that waits for laptop + mobile + CSV, runs Python audio sync, and uploads results to Google Drive.

## Key Features

- Session pairing over Socket.io with QR link.
- Synchronized recording trigger across laptop and mobile.
- Keystroke logging with high-resolution timestamps.
- Audio sync using a 3000 Hz beep + cross-correlation.
- OAuth-based Google Drive upload (one-time admin setup).

## Folder Structure

```
/
├── server.js
├── service-account-key.json (ignored)
├── requirements.txt
├── package.json
└── src/
    ├── app/
    │   ├── page.tsx
    │   ├── globals.css
    │   ├── layout.tsx
    │   ├── mobile/
    │   │   └── page.js
    │   └── api/
    │       ├── upload/
    │       │   └── route.js
    │       ├── oauth/
    │       │   └── route.js
    │       ├── oauth2callback/
    │       │   └── route.js
    │       └── get-upload-token/
    │           └── route.js
    ├── components/
    │   ├── QRCodeDisplay.js
    │   ├── TerminalScripts.js
    │   └── TypingConsole.js
    └── python_scripts/
        └── sync_audio.py
```

## How It Works

1. Laptop requests a session ID from Socket.io.
2. QR encodes the mobile URL with session ID.
3. Mobile joins the same Socket.io room via the QR URL.
4. Laptop "Start Recording" triggers recording on both devices.
5. Laptop "Stop Recording" stops both; both upload audio; laptop uploads CSV.
6. Backend waits for all 3 files, runs Python sync, uploads WAVs + CSV to Drive.

## Local Development

### 1) Install Node dependencies

```
npm install
```

### 2) Python setup

Use a local venv and install Python deps.

```
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

### 3) System deps

Install ffmpeg (system binary).

```
ffmpeg -version
```

### 4) Environment variables

Create .env.local:

```
NEXT_PUBLIC_BASE_URL=https://<your-devtunnel-host>
NEXT_PUBLIC_SOCKET_URL=https://<your-devtunnel-host>
PYTHON_PATH=/absolute/path/to/.venv/bin/python

CLIENT_ID=...
CLIENT_SECRET=...
OAUTH_REDIRECT_URI=https://<your-devtunnel-host>/api/oauth2callback
REFRESH_TOKEN=...
DRIVE_PARENT_FOLDER_ID=1VlFQjn2t-H7_cihRnjmjNjMK3lGt-5xN
```

What each variable does:

- `NEXT_PUBLIC_BASE_URL`: The URL used to build the QR code. In dev, this should be your HTTPS dev‑tunnel host so the phone opens the correct URL.
- `NEXT_PUBLIC_SOCKET_URL`: Socket.io server origin used by both laptop + mobile. Must match the URL the phone can reach (usually the same dev‑tunnel host).
- `PYTHON_PATH`: Absolute path to the Python interpreter used for `sync_audio.py`. Use your venv python.

- `CLIENT_ID`: OAuth client ID from Google Cloud Console.
- `CLIENT_SECRET`: OAuth client secret from Google Cloud Console.
- `OAUTH_REDIRECT_URI`: Must exactly match the redirect URI registered in Google Cloud. For dev tunnel it looks like `https://<devtunnel>/api/oauth2callback`.
- `REFRESH_TOKEN`: One‑time OAuth refresh token generated from `/api/oauth`. The server uses this to get access tokens without user login.
- `DRIVE_PARENT_FOLDER_ID`: Google Drive folder where session folders/files are stored.

Common dev values:

```
NEXT_PUBLIC_BASE_URL=https://b9bsnfsg-3000.inc1.devtunnels.ms
NEXT_PUBLIC_SOCKET_URL=https://b9bsnfsg-3000.inc1.devtunnels.ms
OAUTH_REDIRECT_URI=https://b9bsnfsg-3000.inc1.devtunnels.ms/api/oauth2callback
```

### 5) One-time OAuth setup

- Visit /api/oauth
- Complete consent
- Copy refresh token from /api/oauth2callback
- Add REFRESH_TOKEN to .env.local

### 6) Start dev server

```
npm run dev
```

Open the laptop UI on the devtunnel URL so sockets + QR are same-origin.

## Runtime Notes

- Mobile mic requires HTTPS. Use a dev tunnel for mobile testing.
- Socket.io pairing depends on both clients using the same socket origin.
- Drive uploads use OAuth and do not require participant login.

## Production Deployment

- Vercel can host the Next.js frontend and API routes.
- Socket.io and the Python sync pipeline should run on a separate Node/Python service (Render/Fly/Cloud Run/VPS).
- Frontend should point to that Socket.io service via NEXT_PUBLIC_SOCKET_URL.

## Troubleshooting

- "xhr poll error" or "websocket error": ensure laptop + mobile use the same HTTPS origin.
- "Service Accounts do not have storage quota": use OAuth or Shared Drive.
- No Drive uploads: confirm REFRESH_TOKEN and Drive folder access.
- No mic access: require HTTPS on mobile.

## Security

- Do not commit .env.local or service-account-key.json.
- Keep OAuth credentials private.
