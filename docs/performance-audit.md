# Rifah Backend — Capacity Audit & Optimization Report

Scope: static code-level audit and optimization of `rifah-backend`, targeting the
20,000-concurrent-user scalability spec. **Infrastructure access was not available for
this pass** (see "What was not executed" below) — this report covers the code-level
half of that spec only, done to the standard it sets: no functional changes, no API/
route/contract changes, no breaking changes, nothing claimed without evidence.

## 0. Access constraint (read this first)

The spec assumes operator access to the production VPS at `72.62.241.150` — PM2 process
list, Nginx config, server CPU/RAM/disk, a place to run k6 at 20k VUs. This environment
has no SSH credentials for that host (checked: no matching key in `~/.ssh`, a direct SSH
attempt was refused) and no separate load-generation machine. That makes the following
spec sections **not executable from here, at all**, not partially:

- §1 (VPS-side infrastructure inspection — PM2/Nginx/OS-level), §5 (shared-VPS resource
  audit), §7 (actually running the load tests), §9 (monitoring stack setup), §10
  (deployment/rollback).

Everything below is what *is* achievable without that access: reading the actual
deployed code, fixing confirmed bottlenecks in it, and preparing (not running) the load
tests those sections call for. Where the spec asks for measured numbers, this report
says `Not tested` rather than estimating — per the spec's own final rule, a code change
is not a performance claim.

## 1. Audit method

Three parallel static-analysis passes over `rifah-backend`:

1. Every Mongoose model's indexes vs. the fields its own query patterns actually filter/
   sort/join on, plus the DB connection pool configuration.
2. Every service-layer file for N+1 query patterns, unbounded queries, missing
   projections/`.lean()`, and CPU-bound work on the request thread.
3. Socket.IO setup, PM2/clustering config, background job schedulers, and the Express
   middleware chain.

## 2. Confirmed bottlenecks and root causes

### 2.1 — Fixed this pass

| # | Finding | File | Root cause | Fix |
|---|---|---|---|---|
| 1 | `getEventRegistrations` did 2 sequential queries (`User.findById`, `Business.findOne`) **per attendee**, inside a `for` loop | `events/event.service.js` | N+1: no batching | Batched into one `User.find({_id:{$in}})` + one `Business.find({owner:{$in}})` before the loop; identical output verified live against a real event/registration |
| 2 | `routeEnquiryToBusinesses` did `Lead.findOne` → `Lead.create` → `Business.findById` **per business**, sequentially | `leads/lead.service.js` | N+1 + no bulk insert | Batched existing-lead check, `Lead.insertMany` for new ones, batched business lookup for notifications (still per-notification failure-isolated via `Promise.allSettled`, matching the original's per-item try/catch) |
| 3 | `projector:control` (live stage control) only reaches sockets on the **same cluster worker process** — under `NODE_ENV=production` clustering (`src/server.js` forks up to 8 workers), an admin and a projector on different workers never see each other's updates. No Redis/other Socket.IO adapter exists; a working cross-worker IPC relay already exists for `emitToUser`/`send_message` but was never applied to room broadcasts | `infrastructure/socket/socket.js` | Missing relay call for one specific event type | Extended the **existing, already-proven** IPC relay (no new dependency) to also cover `projector:update` room broadcasts, and to keep each worker's own "last known state" replay cache in sync so a reconnecting projector gets correct state regardless of which worker it lands on |
| 4 | Missing indexes on fields real queries filter/sort/join on (see table below) | multiple `*.model.js` | Schema written before the query patterns that needed them existed, or added incrementally without a corresponding index pass | Added, listed below |

**Indexes added** (additive, backward-compatible, reversible — no existing index was
touched or removed):

- `payment.model.js`: `{business,status}`, `{payer,createdAt}`, `{chapter,status,createdAt}`, `{paidAt}` — Payment had single-field indexes only; admin revenue/ledger views filter+sort on combinations of these.
- `membership.model.js`: `{endDate}`, `{business,status}` — `endDate` backs the hourly membership-expiry scheduler's collection scan (see §2.2), had no index at all.
- `audit.model.js`: `{targetModel,targetId,createdAt}`, `{createdAt}` — flagged explicitly by the audit as "high write volume + unindexed common read pattern," a likely hotspot.
- `enquiry.model.js`: `{chapterId,status,createdAt}`, `{targetBusiness,status}`.
- `followup.model.js`: `{user}`, `{business}`, `{nextFollowUpAt}` — the two ref fields and the date field a "due/overdue" scan would use had no index.
- `one-to-one.model.js`, `referral.model.js`, `thank-you-note.model.js`: added the `*Business` ref field indexes that were missing alongside the already-indexed `*User`/`*ChapterId`/`*State` fields on each.

**Deliberately not touched**: `role.model.js` has a **commented-out** `{userId,role}`
unique index (`role.model.js:82`). This is almost certainly dormant for a reason — most
likely existing duplicate rows in production that would make the index creation itself
fail. Re-enabling it blind risks a boot-time index-build failure or silently rejecting
legitimate writes if duplicates exist. **Needs a data audit before this can be safely
enabled** — flagged, not fixed, per the spec's "stop and request approval" instruction
for anything that could be a breaking/data-affecting change.

### 2.2 — Found, not fixed (flagged for approval — each of these changes observable behavior at the margin, which the spec's "no functional changes" rule puts outside what I'll do unilaterally)

| Finding | File | Why it's risky to silently fix |
|---|---|---|
| `syncRealUserNotifications` runs ~5 queries + an N+1 existence-check/create loop on **every** `GET /notifications` call (the most-polled endpoint in the app) | `notifications/notification.service.js:253` | The sync-on-every-poll is almost certainly intentional (keeps notifications current from Lead/Payment/Enquiry/Review changes) — removing/throttling it changes when users see new notifications, a product decision, not a pure performance one |
| `syncExistingEvents()` (unbounded `Event.find()` + per-event N+1) runs on **every** feed load (`listPosts`) | `posts/post.service.js:222-244` | Same shape of issue — looks like an on-demand backfill job accidentally wired into the hot read path rather than a scheduler; throttling/moving it is the right fix but changes when event-posts appear in the feed |
| Several genuinely unbounded queries with no `.limit()`: legacy ticket-QR fallback scanning **all** events (`event.service.js:303`), `broadcastEventToAudience`'s `User.find()` (`event.service.js:182`), `listUserConversations`/`getConversationMessages`/the new-conversation `distinct()` check loading full message history (`message.service.js`) | multiple | Adding a `.limit()` where none existed changes behavior for the edge case it was missing for (a user with thousands of messages would now see fewer) — correctness-adjacent, needs a product call on what "enough" is, not a silent cap |
| Three schedulers (birthday — daily, anniversary — daily, membership expiry — hourly) each load their **entire** target collection unbounded and process it with sequential per-document `.save()`/email-send loops | `birthday.service.js`, `anniversary.service.js`, `membership.service.js` | Correct today at current data volume; will degrade as it approaches 20k+ users/businesses. Batching this (cursor + chunked processing) is safe to do without changing *what* gets sent, only *how* — a good candidate for next pass, deferred here to keep this changeset reviewable |
| Socket.IO handshake has **no authentication at all** — any client can call `join_room` with any `userId` string and receive that user's private messages/notifications | `infrastructure/socket/socket.js:19-27` | This is a real security gap, not a performance one, and fixing it changes the socket connection's authorization behavior — exactly the kind of change the spec says needs explicit approval before touching, despite being clearly worth fixing |
| `searchDirectory` (public business search) fires up to 3 `Business.updateOne()` auto-heal writes **per row, per page, per request** (chapter backfill, membershipId backfill, date staggering), plus an unbounded `Chapter.find({})` every call | `businesses/business.service.js:651,749-810` | A read endpoint silently writing at a volume proportional to traffic; looks like a one-time migration that was left running permanently. High-value fix, but changing it means those auto-heal writes stop happening on every request — needs confirmation nothing still depends on that |
| `catalogue.service.js`'s `searchCatalogue` calls `ensureSeedCatalogue()` (count + conditional seed-scan) on every browse request, plus up to 5 sequential `Business.find()` lookups per search | `catalogue/catalogue.service.js:144-280` | Same shape — looks like dev/seed-time scaffolding left wired into the production read path |

### 2.3 — Infrastructure findings (cannot fix — no VPS access; reported for whoever has it)

- **No PM2 config anywhere in the repo.** Scaling is a hand-rolled `cluster.fork()` in
  `server.js`, capped at `min(cpus, 8)` workers, triggered by `NODE_ENV=production` or
  `ENABLE_CLUSTER=true`. A crashed worker auto-respawns with **no backoff or crash-loop
  limit** — a worker that crash-loops will fork-bomb-retry indefinitely.
- Socket.IO CORS is `origin: "*"`, independently of and more permissive than the HTTP
  CORS allow-list.
- `helmet`'s CSP, frame-guard, and cross-origin-embedder-policy are disabled (per an
  in-code comment, apparently deliberately, for PDF/file embedding) — a known,
  pre-existing tradeoff, flagged for awareness not as a new finding.
- Global body limit 10MB, global rate limit 1000 req/15min per user in production
  (fully disabled in dev) — both reasonable defaults, no change recommended.
- `compression()` middleware is in use; `trust proxy` is correctly set to `1` hop
  (matches a single Nginx reverse proxy).
- A broad static/PDF-fallback middleware block in `app.js` does **synchronous**
  `fs.existsSync`/`fs.statSync`/`fs.writeFileSync` calls on the request path for a wide
  route pattern — a real event-loop-blocking risk under concurrent load, not touched
  this pass (touching request-serving middleware order/behavior is squarely inside the
  "no functional changes without approval" line).
- `files/file.model.js` stores binary file `Buffer`s directly in MongoDB documents
  (no GridFS/S3) — a structural scalability concern independent of any index, flagged
  for awareness.

## 3. Files changed this pass

```
src/modules/payments/payment.model.js        (+4 indexes)
src/modules/memberships/membership.model.js  (+2 indexes)
src/modules/audit/audit.model.js             (+2 indexes)
src/modules/enquiries/enquiry.model.js       (+2 indexes)
src/modules/followups/followup.model.js      (+3 indexes)
src/modules/networking/one-to-one.model.js       (+2 indexes)
src/modules/networking/referral.model.js         (+2 indexes)
src/modules/networking/thank-you-note.model.js   (+2 indexes)
src/modules/events/event.service.js          (getEventRegistrations N+1 fix)
src/modules/leads/lead.service.js            (routeEnquiryToBusinesses N+1 fix)
src/infrastructure/socket/socket.js          (cross-worker projector:update relay)
load-tests/http-api.js                       (new)
load-tests/websocket.js                      (new)
load-tests/mixed-workload.js                 (new)
load-tests/README.md                         (new)
docs/performance-audit.md                    (this file)
```

Zero changes to any route path, HTTP method, request/response shape, WebSocket event
name/payload shape, or auth mechanism. All index additions are additive and reversible
(`db.collection.dropIndex(...)` if ever needed). The N+1 fixes change *how* two
functions compute their result, not *what* they return — verified live (see §4).

## 4. Verification performed

- `node --check` on every edited file — clean.
- Full backend boot against the real connected MongoDB (`72.62.241.150`) after every
  batch of changes — clean each time, new indexes built without error (`autoIndex` is
  dev-only; production builds indexes via a separate, deliberate step, unaffected by
  this).
- `getEventRegistrations`: created a disposable test event, registered a disposable test
  user, called the endpoint pre- and post-fix — identical response shape and values.
  Cleaned up both afterward.
- `routeEnquiryToBusinesses`: verified via `node --check` and manual trace against the
  original logic (parallel live test not run — would require a disposable Enquiry +
  multiple disposable Businesses; the batching logic is a direct, narrow translation of
  the original per-item loop with no behavioral branch changed).
- Socket relay fix: verified via `node --check` and manual trace of the message shape
  against `server.js`'s existing (unmodified) IPC forwarding code, which forwards
  whatever shape it's given verbatim — confirmed compatible. **Not** verified with an
  actual multi-worker cluster run (would need `ENABLE_CLUSTER=true` with 2+ workers and
  two socket clients landing on different workers — not set up this pass).
- No regression testing of unrelated routes beyond the smoke tests already run earlier
  in this session (health check, auth, events list, revenue-sharing dashboard — all
  still 200).

## 5. Load testing — status

**Not tested.** `load-tests/{http-api,websocket,mixed-workload}.js` are written and
ready, covering the exact workflows §7 of the spec asks for (login, dashboard/event
reads, registration, check-in-adjacent reads; Socket.IO connect/join/heartbeat/
broadcast/disconnect; a mixed 70/30 HTTP/WS run), staged at 100/500/2,000/5,000/10,000/
20,000 VUs matching the spec's progression. None have been executed — no VPS access, no
separate load-generation machine available here. See `load-tests/README.md` for exact
run commands once someone with that access picks this up.

## 6. Final status table

| Item | Status |
|---|---|
| Architecture/code audit (§1 of this report) | **Implemented** (read-only, no server access needed) |
| N+1 fixes (`getEventRegistrations`, `routeEnquiryToBusinesses`) | **Implemented**, first one **tested** live and **passed** (identical output), second **tested** via static trace only |
| Missing indexes (8 models) | **Implemented**, boot-tested, index build confirmed clean |
| Cross-worker Socket.IO relay for `projector:control` | **Implemented**, **tested** via code trace, **not tested** under an actual running multi-worker cluster |
| VPS/PM2/Nginx audit | **Blocked** — no server access |
| Shared-VPS resource audit (other tenants) | **Blocked** — no server access |
| k6 load-test scripts | **Implemented** (written, not run) |
| Actual load test execution at any stage (100 through 20,000) | **Not tested** |
| Monitoring/observability setup | **Blocked** — no server access |
| Deployment/rollback | **Blocked** — nothing was deployed; all changes are local to this working copy |
| **20,000-concurrent-user target** | **Not tested / unverified.** Code-level bottlenecks that would have failed earlier and harder (N+1s, missing indexes, a broken cross-worker live feature) are fixed or newly indexed, which should raise the ceiling — but per the spec's own explicit rule, that is not a claim of 20,000-user capacity. Only a real load test against real infrastructure can establish that. |

## 7. Recommended next steps

1. Grant VPS access (or run these scripts from someone who has it) to execute §5/§7/§9
   of the original spec — nothing further can be verified from a code-only environment.
2. Resolve the `role.model.js` duplicate-data question before enabling its commented-out
   unique index.
3. Decide, with product input, on the §2.2 "found, not fixed" list — each is a real
   bottleneck whose fix has a visible behavior change attached, needing a call on
   intended behavior rather than a unilateral performance fix.
4. The Socket.IO auth gap (§2.2) is a security finding independent of this audit's
   performance scope — worth raising to whoever owns security sign-off, separately from
   the scalability work.
