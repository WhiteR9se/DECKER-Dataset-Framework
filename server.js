const http = require("http");
const next = require("next");
const { Server } = require("socket.io");
const fs = require("fs/promises");
const os = require("os");
const path = require("path");

const dev = process.env.NODE_ENV !== "production";
const port = parseInt(process.env.PORT || "3000", 10);
const app = next({ dev });
const handle = app.getRequestHandler();

let sessionCounter = 0;

function nextSessionId() {
  sessionCounter += 1;
  return `DECKER_SESS_${String(sessionCounter).padStart(3, "0")}`;
}

app.prepare().then(() => {
  const uploadRoot = path.join(os.tmpdir(), "decker_sessions");
  const cleanupThresholdMs = 60 * 60 * 1000;

  const cleanupOldFiles = async () => {
    try {
      await fs.mkdir(uploadRoot, { recursive: true });
      const entries = await fs.readdir(uploadRoot, { withFileTypes: true });
      const now = Date.now();

      await Promise.all(
        entries.map(async (entry) => {
          if (!entry.isDirectory()) return;
          const sessionPath = path.join(uploadRoot, entry.name);
          const files = await fs.readdir(sessionPath);
          const stats = await Promise.all(
            files.map(async (file) => {
              const filePath = path.join(sessionPath, file);
              const stat = await fs.stat(filePath);
              return { filePath, stat };
            })
          );

          await Promise.all(
            stats
              .filter(({ stat }) => now - stat.mtimeMs > cleanupThresholdMs)
              .map(({ filePath }) => fs.unlink(filePath))
          );

          const remaining = await fs.readdir(sessionPath);
          if (remaining.length === 0) {
            await fs.rmdir(sessionPath);
          }
        })
      );
    } catch (error) {
      console.warn("Cleanup error", error);
    }
  };

  cleanupOldFiles();
  setInterval(cleanupOldFiles, cleanupThresholdMs);

  const httpServer = http.createServer((req, res) => {
    handle(req, res);
  });

  const io = new Server(httpServer, {
    path: "/socket.io",
    cors: {
      origin: "*",
      methods: ["GET", "POST"],
    },
  });

  io.on("connection", (socket) => {
    console.log("Socket connected:", socket.id);

    socket.on("request_session", () => {
      const sessionId = nextSessionId();
      const room = `room:${sessionId}`;

      socket.join(room);
      console.log("Session created:", sessionId, "socket:", socket.id);
      socket.emit("session_created", { sessionId });
    });

    socket.on("join_room", (payload) => {
      const sessionId = payload?.sessionId;
      if (!sessionId) {
        socket.emit("error", { message: "Missing sessionId" });
        return;
      }

      const room = `room:${sessionId}`;
      socket.join(room);
      const size = io.sockets.adapter.rooms.get(room)?.size || 0;
      console.log("Join room:", room, "socket:", socket.id, "size:", size);
      io.to(room).emit("devices_paired", { sessionId });
    });

    socket.on("start_recording_command", (payload) => {
      const sessionId = payload?.sessionId;
      if (!sessionId) {
        socket.emit("error", { message: "Missing sessionId" });
        return;
      }

      const room = `room:${sessionId}`;
      const size = io.sockets.adapter.rooms.get(room)?.size || 0;
      console.log("Start recording:", room, "socket:", socket.id, "size:", size);
      io.to(room).emit("trigger_recording", { sessionId });
    });

    socket.on("stop_recording_command", (payload) => {
      const sessionId = payload?.sessionId;
      if (!sessionId) {
        socket.emit("error", { message: "Missing sessionId" });
        return;
      }

      const room = `room:${sessionId}`;
      const size = io.sockets.adapter.rooms.get(room)?.size || 0;
      console.log("Stop recording:", room, "socket:", socket.id, "size:", size);
      io.to(room).emit("stop_recording", { sessionId });
    });

    socket.on("stop_recording_ack", (payload) => {
      const sessionId = payload?.sessionId;
      console.log(
        "Stop ack:",
        sessionId || "unknown",
        "socket:",
        socket.id
      );
    });

    socket.on("disconnect", () => {
      console.log("Socket disconnected:", socket.id);
    });
  });

  httpServer.listen(port, () => {
    console.log(`> Ready on http://localhost:${port}`);
  });
});
