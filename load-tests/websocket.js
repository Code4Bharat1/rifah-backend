// k6 WebSocket load test for the Rifah backend's Socket.IO server.
//
// Covers: connection establishment, join_room (per-user room), projector:join
// (event-room subscription), heartbeat (Engine.IO ping/pong), a realistic
// projector:control broadcast, and disconnect — per the audit's WebSocket
// test-coverage list.
//
// Speaks the Socket.IO v4 / Engine.IO v4 wire protocol directly over k6's `k6/ws`
// module (k6 has no socket.io-client), connecting straight to the websocket
// transport (skips the HTTP long-poll handshake step real browsers sometimes use
// first). Packet framing reference:
//   Engine.IO: 0=open 1=close 2=ping 3=pong 4=message
//   Socket.IO (carried inside an Engine.IO "4" message): 0=CONNECT 2=EVENT
//
// NOT YET RUN against the real VPS (no SSH/server access was available when this
// was written — see docs/performance-audit.md). The server's socket.js currently
// does not authenticate the handshake or verify join_room's userId belongs to the
// caller (flagged separately as a security finding) — this script reflects that
// current, unauthenticated behavior; it is not asserting that lack of auth is
// correct, only exercising what the server actually accepts today.
//
// Usage:
//   k6 run -e WS_URL=wss://staging.example.com -e TEST_EVENT_ID=... \
//          --stage 30s:100 --stage 2m:100 \
//          load-tests/websocket.js

import ws from "k6/ws";
import { check, sleep } from "k6";
import { Counter, Trend } from "k6/metrics";

const WS_URL = __ENV.WS_URL || "ws://localhost:5000";
const TEST_EVENT_ID = __ENV.TEST_EVENT_ID || "loadtest-room";
const SESSION_SECONDS = Number(__ENV.WS_SESSION_SECONDS || 30);

const STAGE_PROFILES = {
  100: [{ duration: "30s", target: 100 }, { duration: "2m", target: 100 }, { duration: "30s", target: 0 }],
  500: [{ duration: "30s", target: 500 }, { duration: "3m", target: 500 }, { duration: "30s", target: 0 }],
  2000: [{ duration: "1m", target: 2000 }, { duration: "4m", target: 2000 }, { duration: "1m", target: 0 }],
  5000: [{ duration: "2m", target: 5000 }, { duration: "5m", target: 5000 }, { duration: "1m", target: 0 }],
  10000: [{ duration: "3m", target: 10000 }, { duration: "5m", target: 10000 }, { duration: "2m", target: 0 }],
  20000: [{ duration: "5m", target: 20000 }, { duration: "5m", target: 20000 }, { duration: "3m", target: 0 }],
};

const connectDuration = new Trend("rifah_ws_connect_duration", true);
const messagesReceived = new Counter("rifah_ws_messages_received");
const pingsAnswered = new Counter("rifah_ws_pings_answered");
const projectorUpdatesReceived = new Counter("rifah_ws_projector_updates_received");

export const options = {
  stages: STAGE_PROFILES[__ENV.STAGE_PROFILE] || STAGE_PROFILES[100],
  thresholds: {
    rifah_ws_connect_duration: ["p(95)<1000"],
  },
};

export default function () {
  const userId = `loadtest-user-${__VU}-${__ITER}`;
  const url = `${WS_URL}/socket.io/?EIO=4&transport=websocket`;
  const connectStart = Date.now();

  const res = ws.connect(url, {}, function (socket) {
    let gotEngineOpen = false;
    let gotSocketioConnect = false;

    socket.on("open", () => {
      connectDuration.add(Date.now() - connectStart);
    });

    socket.on("message", (data) => {
      messagesReceived.add(1);

      if (typeof data !== "string" || data.length === 0) return;
      const engineType = data[0];

      // "0{...}" — Engine.IO open packet: now send the Socket.IO CONNECT packet.
      if (engineType === "0" && !gotEngineOpen) {
        gotEngineOpen = true;
        socket.send("40");
        return;
      }

      // "2" — Engine.IO ping: must pong back within pingTimeout or the server drops us.
      if (data === "2") {
        socket.send("3");
        pingsAnswered.add(1);
        return;
      }

      // "40{...}" — Socket.IO CONNECT ack: now join our user room and the event's
      // projector room, same as the real frontend does on load.
      if (data.startsWith("40") && !gotSocketioConnect) {
        gotSocketioConnect = true;
        socket.send(`42["join_room","${userId}"]`);
        socket.send(`42["projector:join","${TEST_EVENT_ID}"]`);
        return;
      }

      // "42[...]" — an EVENT packet from the server (e.g. projector:update,
      // receive_message, update_conversations).
      if (data.startsWith("42")) {
        try {
          const payload = JSON.parse(data.slice(2));
          if (payload[0] === "projector:update") {
            projectorUpdatesReceived.add(1);
          }
        } catch {
          // non-JSON or unexpected shape — still counted in messagesReceived above
        }
      }
    });

    socket.on("error", (e) => {
      check(null, { "no ws error": () => false });
    });

    // Simulate a live event: periodically broadcast a projector:control update (as an
    // admin's console would), then hold the connection open like a real projector/admin
    // tab would for the rest of the session, answering heartbeats as they arrive.
    socket.setTimeout(() => {
      socket.send(
        `42["projector:control",${JSON.stringify({
          target: TEST_EVENT_ID,
          action: "slide",
          slideIndex: __ITER % 10,
          slideTitle: `Load test slide ${__ITER}`,
        })}]`
      );
    }, 2000);

    socket.setTimeout(() => {
      socket.close();
    }, SESSION_SECONDS * 1000);
  });

  check(res, { "ws handshake status 101": (r) => r && r.status === 101 });

  sleep(1);
}
