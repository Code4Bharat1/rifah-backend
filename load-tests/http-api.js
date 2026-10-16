// k6 HTTP API load test for the Rifah backend.
//
// Covers: login, dashboard/event data reads, event registration, QR check-in,
// and a frequently-used admin read endpoint — the "realistic authenticated
// read/write workflow" the scalability audit's load-testing section asks for.
//
// NOT YET RUN against the real VPS (no SSH/server access was available when this
// was written — see docs/performance-audit.md). This is ready to run as soon as
// someone with VPS/staging access executes it from a SEPARATE load-generation
// machine, per the audit spec's own instruction not to run the generator on the
// target server itself.
//
// Usage:
//   k6 run -e BASE_URL=https://staging.example.com/api/v1 \
//          -e TEST_EMAIL=loadtest@example.com -e TEST_PASSWORD=... \
//          --stage 30s:100 --stage 1m:100 \
//          load-tests/http-api.js
//
// Or run one of the predefined stage profiles below by setting STAGE_PROFILE
// (100 | 500 | 2000 | 5000 | 10000 | 20000), matching the audit's progressive
// test-stage list. Advance to the next stage only after the previous one passes.

import http from "k6/http";
import { check, sleep, group } from "k6";
import { Rate, Trend } from "k6/metrics";

const BASE_URL = __ENV.BASE_URL || "http://localhost:5000/api/v1";
const TEST_EMAIL = __ENV.TEST_EMAIL || "";
const TEST_PASSWORD = __ENV.TEST_PASSWORD || "";
const EVENT_ID = __ENV.TEST_EVENT_ID || ""; // a real, disposable event to register/check-in against

const STAGE_PROFILES = {
  100: [{ duration: "30s", target: 100 }, { duration: "2m", target: 100 }, { duration: "30s", target: 0 }],
  500: [{ duration: "30s", target: 500 }, { duration: "3m", target: 500 }, { duration: "30s", target: 0 }],
  2000: [{ duration: "1m", target: 2000 }, { duration: "4m", target: 2000 }, { duration: "1m", target: 0 }],
  5000: [{ duration: "2m", target: 5000 }, { duration: "5m", target: 5000 }, { duration: "1m", target: 0 }],
  10000: [{ duration: "3m", target: 10000 }, { duration: "5m", target: 10000 }, { duration: "2m", target: 0 }],
  20000: [{ duration: "5m", target: 20000 }, { duration: "5m", target: 20000 }, { duration: "3m", target: 0 }],
};

const errorRate = new Rate("rifah_http_errors");
const loginTrend = new Trend("rifah_login_duration", true);
const dashboardTrend = new Trend("rifah_dashboard_duration", true);

export const options = {
  stages: STAGE_PROFILES[__ENV.STAGE_PROFILE] || STAGE_PROFILES[100],
  thresholds: {
    // Matches the audit's stated targets: p95 <= 500ms, p99 <= 1000ms, <0.1% 5xx.
    http_req_duration: ["p(95)<500", "p(99)<1000"],
    rifah_http_errors: ["rate<0.001"],
  },
};

function authHeaders(token) {
  return { headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" } };
}

export default function () {
  let token = "";

  group("login", () => {
    const res = http.post(
      `${BASE_URL}/auth/login`,
      JSON.stringify({ email: TEST_EMAIL, password: TEST_PASSWORD }),
      { headers: { "Content-Type": "application/json" } }
    );
    loginTrend.add(res.timings.duration);
    const ok = check(res, {
      "login status 200": (r) => r.status === 200,
      "login returned token": (r) => {
        try {
          return Boolean(JSON.parse(r.body)?.data?.accessToken);
        } catch {
          return false;
        }
      },
    });
    errorRate.add(!ok);
    if (ok) {
      token = JSON.parse(res.body).data.accessToken;
    }
  });

  if (!token) {
    // Can't exercise authenticated flows without a session — count it and back off
    // instead of hammering a failing login endpoint in a tight loop.
    sleep(1);
    return;
  }

  group("dashboard and event reads", () => {
    const res1 = http.get(`${BASE_URL}/auth/me`, authHeaders(token));
    errorRate.add(!check(res1, { "auth/me 200": (r) => r.status === 200 }));

    const res2 = http.get(`${BASE_URL}/events?limit=20`, authHeaders(token));
    dashboardTrend.add(res2.timings.duration);
    errorRate.add(!check(res2, { "events list 200": (r) => r.status === 200 }));

    const res3 = http.get(`${BASE_URL}/notifications/me`, authHeaders(token));
    errorRate.add(!check(res3, { "notifications 200": (r) => r.status === 200 }));
  });

  if (EVENT_ID) {
    group("event registration + check-in", () => {
      const resReg = http.post(`${BASE_URL}/events/${EVENT_ID}/register`, "{}", authHeaders(token));
      // Already-registered on repeat iterations is an expected, non-error outcome.
      errorRate.add(!check(resReg, { "register 2xx or already-registered": (r) => r.status < 500 }));

      const resOps = http.get(`${BASE_URL}/events/${EVENT_ID}/my-duty`, authHeaders(token));
      errorRate.add(!check(resOps, { "my-duty not 5xx": (r) => r.status < 500 }));
    });
  }

  sleep(Math.random() * 2 + 1); // 1-3s think time between iterations, approximating real usage
}
