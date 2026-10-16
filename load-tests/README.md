# Rifah Load Test Suite

k6 scripts for the backend scalability audit (target: 20,000 concurrent users). See
`../docs/performance-audit.md` for the full audit report these support.

**Status: written, not executed.** These were authored without SSH/server access to the
production VPS (`72.62.241.150`) and without a separate load-generation machine, both of
which this suite explicitly requires. Nothing here has been run against real
infrastructure — do not treat any number in the audit report as a result of these
scripts; there are no results yet.

## Prerequisites

- [k6](https://k6.io/docs/get-started/installation/) installed on a machine that is
  **not** the Rifah server itself (running the load generator on the target server
  invalidates the measurements — CPU spent generating load competes with CPU needed to
  serve it).
- A disposable test account (email/password) and, for the event-related checks, a
  disposable test event ID — do not point these at real user accounts or production
  events, since `http-api.js` registers for the event on every iteration.
- A staging environment is strongly preferred for anything above the 100-VU stage.
  Production testing needs explicit approval and traffic safeguards per the audit's own
  rules (section 7, 10).

## Scripts

| File | Covers |
|---|---|
| `http-api.js` | Login, session check, event list, notifications, event registration, My Duty (check-in-adjacent read) |
| `websocket.js` | Socket.IO connection, user-room join, projector-room join, heartbeat ping/pong, a projector:control broadcast, disconnect |
| `mixed-workload.js` | Both of the above running concurrently via k6 scenarios (~70% HTTP / ~30% WebSocket VU split) |

## Running a staged test

Each script reads `STAGE_PROFILE` (`100`, `500`, `2000`, `5000`, `10000`, `20000`) and
picks a matching ramp-up/hold/ramp-down stage set. Per the audit's instructions, advance
to the next stage only after the current one passes its thresholds (p95 < 500ms,
p99 < 1000ms, error rate < 0.1%).

```bash
k6 run \
  -e BASE_URL=https://staging.example.com/api/v1 \
  -e WS_URL=wss://staging.example.com \
  -e TEST_EMAIL=loadtest@example.com \
  -e TEST_PASSWORD='...' \
  -e TEST_EVENT_ID=<disposable-event-id> \
  -e STAGE_PROFILE=100 \
  http-api.js
```

Swap the last argument for `websocket.js` or `mixed-workload.js` to run those instead.

## Sustained-load and spike tests

Once a stage passes, re-run it as a sustained test (hold the target VU count for
15-30 minutes instead of the default 2-5 minutes) to catch memory leaks and slow
degradation, by overriding `--stage` on the command line, e.g.:

```bash
k6 run -e STAGE_PROFILE=5000 --stage 2m:5000 --stage 30m:5000 --stage 2m:0 http-api.js
```

For a spike test, jump straight to target with no ramp:

```bash
k6 run -e STAGE_PROFILE=5000 --stage 10s:5000 --stage 3m:5000 --stage 1m:0 http-api.js
```

## Interpreting results

k6 prints `http_req_duration` percentiles and the custom `rifah_*` metrics defined in
each script at the end of the run (or continuously with `--out` to a time-series
backend). Cross-reference with server-side CPU/RAM/MongoDB metrics captured during the
same window — a passing k6 threshold with the server pinned at 100% CPU is not a pass.
