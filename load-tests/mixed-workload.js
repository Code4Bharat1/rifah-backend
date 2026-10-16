// k6 mixed-workload load test: HTTP API traffic and WebSocket connections running
// concurrently, representing realistic Rifah usage during a live event (per the
// scalability audit's section 7C). Two independent k6 scenarios share one run.
//
// NOT YET RUN against the real VPS (no SSH/server access was available when this
// was written — see docs/performance-audit.md).
//
// Usage:
//   k6 run -e BASE_URL=https://staging.example.com/api/v1 -e WS_URL=wss://staging.example.com \
//          -e TEST_EMAIL=loadtest@example.com -e TEST_PASSWORD=... -e TEST_EVENT_ID=... \
//          -e STAGE_PROFILE=100 \
//          load-tests/mixed-workload.js

import http from "k6/http";
import ws from "k6/ws";
import { check, sleep } from "k6";
import { Rate, Counter, Trend } from "k6/metrics";

const BASE_URL = __ENV.BASE_URL || "http://localhost:5000/api/v1";
const WS_URL = __ENV.WS_URL || "ws://localhost:5000";
const TEST_EMAIL = __ENV.TEST_EMAIL || "";
const TEST_PASSWORD = __ENV.TEST_PASSWORD || "";
const TEST_EVENT_ID = __ENV.TEST_EVENT_ID || "loadtest-room";

// Mixed workload splits target VUs ~70/30 HTTP/WebSocket, matching the rough ratio of
// "everyone browsing" to "everyone with the live event screen open" during an event.
const STAGE_PROFILES = {
  100: { http: [{ duration: "30s", target: 70 }, { duration: "2m", target: 70 }, { duration: "30s", target: 0 }], ws: [{ duration: "30s", target: 30 }, { duration: "2m", target: 30 }, { duration: "30s", target: 0 }] },
  500: { http: [{ duration: "30s", target: 350 }, { duration: "3m", target: 350 }, { duration: "30s", target: 0 }], ws: [{ duration: "30s", target: 150 }, { duration: "3m", target: 150 }, { duration: "30s", target: 0 }] },
  2000: { http: [{ duration: "1m", target: 1400 }, { duration: "4m", target: 1400 }, { duration: "1m", target: 0 }], ws: [{ duration: "1m", target: 600 }, { duration: "4m", target: 600 }, { duration: "1m", target: 0 }] },
  5000: { http: [{ duration: "2m", target: 3500 }, { duration: "5m", target: 3500 }, { duration: "1m", target: 0 }], ws: [{ duration: "2m", target: 1500 }, { duration: "5m", target: 1500 }, { duration: "1m", target: 0 }] },
  10000: { http: [{ duration: "3m", target: 7000 }, { duration: "5m", target: 7000 }, { duration: "2m", target: 0 }], ws: [{ duration: "3m", target: 3000 }, { duration: "5m", target: 3000 }, { duration: "2m", target: 0 }] },
  20000: { http: [{ duration: "5m", target: 14000 }, { duration: "5m", target: 14000 }, { duration: "3m", target: 0 }], ws: [{ duration: "5m", target: 6000 }, { duration: "5m", target: 6000 }, { duration: "3m", target: 0 }] },
};

const profile = STAGE_PROFILES[__ENV.STAGE_PROFILE] || STAGE_PROFILES[100];

const httpErrorRate = new Rate("rifah_mixed_http_errors");
const wsConnectDuration = new Trend("rifah_mixed_ws_connect_duration", true);
const wsMessagesReceived = new Counter("rifah_mixed_ws_messages_received");

export const options = {
  scenarios: {
    http_traffic: {
      executor: "ramping-vus",
      exec: "httpWorkflow",
      startVUs: 0,
      stages: profile.http,
    },
    websocket_traffic: {
      executor: "ramping-vus",
      exec: "wsWorkflow",
      startVUs: 0,
      stages: profile.ws,
    },
  },
  thresholds: {
    http_req_duration: ["p(95)<500", "p(99)<1000"],
    rifah_mixed_http_errors: ["rate<0.001"],
  },
};

export function httpWorkflow() {
  const loginRes = http.post(
    `${BASE_URL}/auth/login`,
    JSON.stringify({ email: TEST_EMAIL, password: TEST_PASSWORD }),
    { headers: { "Content-Type": "application/json" } }
  );
  const ok = check(loginRes, { "login 200": (r) => r.status === 200 });
  httpErrorRate.add(!ok);
  if (!ok) {
    sleep(1);
    return;
  }

  const token = JSON.parse(loginRes.body).data.accessToken;
  const headers = { headers: { Authorization: `Bearer ${token}` } };

  const eventsRes = http.get(`${BASE_URL}/events?limit=20`, headers);
  httpErrorRate.add(!check(eventsRes, { "events 200": (r) => r.status === 200 }));

  if (TEST_EVENT_ID) {
    const regRes = http.post(`${BASE_URL}/events/${TEST_EVENT_ID}/register`, "{}", headers);
    httpErrorRate.add(!check(regRes, { "register not 5xx": (r) => r.status < 500 }));
  }

  sleep(Math.random() * 2 + 1);
}

export function wsWorkflow() {
  const userId = `loadtest-ws-${__VU}-${__ITER}`;
  const url = `${WS_URL}/socket.io/?EIO=4&transport=websocket`;
  const start = Date.now();

  const res = ws.connect(url, {}, function (socket) {
    socket.on("open", () => wsConnectDuration.add(Date.now() - start));

    socket.on("message", (data) => {
      wsMessagesReceived.add(1);
      if (typeof data !== "string") return;
      if (data === "2") {
        socket.send("3"); // Engine.IO heartbeat
      } else if (data[0] === "0") {
        socket.send("40");
      } else if (data.startsWith("40")) {
        socket.send(`42["join_room","${userId}"]`);
        socket.send(`42["projector:join","${TEST_EVENT_ID}"]`);
      }
    });

    socket.setTimeout(() => socket.close(), 30000);
  });

  check(res, { "ws handshake 101": (r) => r && r.status === 101 });
  sleep(1);
}
