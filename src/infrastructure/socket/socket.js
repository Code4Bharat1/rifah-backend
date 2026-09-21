import { Server } from "socket.io";
import { logger } from "../logger/logger.js";

let io;

// Last known projector:control payload per room, replayed to newly-joining sockets
// (projector page load/refresh/reconnect) so late joiners see current ticker/slide/QR/mode
// state instead of waiting for the next unrelated broadcast.
const lastProjectorState = new Map();

export const initSocket = (httpServer) => {
  io = new Server(httpServer, {
    cors: {
      origin: "*",
      methods: ["GET", "POST"],
    },
  });

  io.on("connection", (socket) => {
    logger.info(`Socket connected: ${socket.id}`);

    socket.on("join_room", (userId) => {
      if (userId) {
        socket.join(String(userId));
        logger.info(`Socket ${socket.id} joined user room ${userId}`);
      }
    });

    // Projector and Live Control synchronization
    socket.on("projector:join", (chapterOrEventId) => {
      if (chapterOrEventId) {
        const room = `projector_${String(chapterOrEventId).toLowerCase().replace(/[^a-z0-9_-]/g, "_")}`;
        socket.join(room);
        logger.info(`Socket ${socket.id} joined projector room ${room}`);

        // Replay last known state so a fresh/reconnecting projector page (or admin console)
        // immediately reflects current slide/mode/ticker/QR instead of showing stale defaults.
        const lastState = lastProjectorState.get(room);
        if (lastState) {
          socket.emit("projector:update", lastState);
        }
      }
    });

    socket.on("projector:control", (data) => {
      if (data?.target) {
        const room = `projector_${String(data.target).toLowerCase().replace(/[^a-z0-9_-]/g, "_")}`;
        // Merge (not overwrite) — admin emits separate partial payloads for slide changes,
        // mode switches, and ticker/announcement updates, so the cache must accumulate the
        // fullest known state rather than lose earlier fields on each new partial broadcast.
        const merged = { ...(lastProjectorState.get(room) || {}), ...data };
        lastProjectorState.set(room, merged);
        socket.to(room).emit("projector:update", data);
        logger.info(`Socket ${socket.id} broadcasted projector update to ${room}`);
      }
    });

    socket.on("send_message", (data) => {
      if (data?.recipientId) {
        io.to(String(data.recipientId)).emit("receive_message", data);
        io.to(String(data.recipientId)).emit("update_conversations", data);
      }
      if (data?.senderId) {
        io.to(String(data.senderId)).emit("update_conversations", data);
      }
    });

    socket.on("disconnect", () => {
      logger.info(`Socket disconnected: ${socket.id}`);
    });
  });

  return io;
};

export const getIO = () => {
  if (!io) {
    throw new Error("Socket.io not initialized!");
  }
  return io;
};

export const emitToUser = (userId, event, payload) => {
  if (io && userId) {
    io.to(String(userId)).emit(event, payload);
  }
};
