// Token lifecycle + input validation + rate limiting. Throwaway local MongoDB only.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";

const TEST_URI = process.env.QA_MONGODB_URI || "mongodb://localhost:27018/rifah_qa_tokens";
process.env.MONGODB_URI = TEST_URI;
process.env.NODE_ENV = "test";
process.env.RATE_LIMIT_MAX_REQUESTS = "100000";
process.env.AUTH_RATE_LIMIT_MAX = "30";

let request, mongoose, User, jwt, env, signAccessToken, signRefreshToken, bcrypt;
let owner, admin;
const API = "/api/v1";
const bearer = (t) => ({ Authorization: `Bearer ${t}` });

before(async () => {
  assert.ok(/localhost|127\.0\.0\.1/.test(TEST_URI), "refusing to run against non-local DB");
  mongoose = (await import("mongoose")).default;
  await mongoose.connect(TEST_URI);
  await mongoose.connection.dropDatabase();
  jwt = (await import("jsonwebtoken")).default;
  bcrypt = (await import("bcryptjs")).default;
  ({ env } = await import("../../src/config/env.js"));
  ({ User } = await import("../../src/modules/users/user.model.js"));
  ({ signAccessToken, signRefreshToken } = await import("../../src/infrastructure/auth/jwt.js"));
  request = (await import("supertest")).default((await import("../../src/app.js")).app);
  const passwordHash = await bcrypt.hash("Passw0rd!x", 4);
  const mk = (name, role) => new User({ name, email: `${name}@t.local`, role, status: "Active", passwordHash, forcePasswordChange: false }).save({ validateBeforeSave: false });
  owner = await mk("owner", "business_owner");
  admin = await mk("admin", "central_admin");
});
after(async () => { await mongoose?.disconnect(); setTimeout(() => process.exit(0), 50).unref(); });

const payload = (u) => ({ id: u._id, email: u.email, role: u.role });

test("valid token -> 200", async () => {
  assert.equal((await request.get(`${API}/auth/me`).set(bearer(signAccessToken(payload(owner))))).status, 200);
});

test("expired token -> 401 TOKEN_EXPIRED", async () => {
  const t = signAccessToken(payload(owner), "-10s");
  const r = await request.get(`${API}/auth/me`).set(bearer(t));
  assert.equal(r.status, 401);
  assert.equal(r.body.code || r.body.error?.code, "TOKEN_EXPIRED");
});

test("tampered payload (role->central_admin, original signature) -> 401", async () => {
  const t = signAccessToken(payload(owner));
  const [h, , s] = t.split(".");
  const p = Buffer.from(JSON.stringify({ ...payload(owner), role: "central_admin", exp: Math.floor(Date.now() / 1000) + 999 })).toString("base64url");
  assert.equal((await request.get(`${API}/reports/admin/overview`).set(bearer(`${h}.${p}.${s}`))).status, 401);
});

test("alg=none token -> 401", async () => {
  const h = Buffer.from(JSON.stringify({ alg: "none", typ: "JWT" })).toString("base64url");
  const p = Buffer.from(JSON.stringify({ ...payload(admin), exp: Math.floor(Date.now() / 1000) + 999 })).toString("base64url");
  assert.equal((await request.get(`${API}/auth/me`).set(bearer(`${h}.${p}.`))).status, 401);
});

test("token signed with wrong secret -> 401", async () => {
  assert.equal((await request.get(`${API}/auth/me`).set(bearer(jwt.sign(payload(admin), "nope")))).status, 401);
});

test("refresh token must not work as access token", async () => {
  const r = await request.get(`${API}/auth/me`).set(bearer(signRefreshToken(payload(owner))));
  assert.equal(r.status, 401, "refresh token accepted as access token");
});

test("access token must not work as refresh token", async () => {
  const r = await request.post(`${API}/auth/refresh-token`).send({ refreshToken: signAccessToken(payload(owner)) });
  assert.equal(r.status, 401, "access token accepted as refresh token");
});

for (const [label, header] of [["no header", undefined], ["Bearer only", "Bearer"], ["Basic scheme", "Basic abc"], ["empty token", "Bearer "], ["garbage", "Bearer a.b.c"]]) {
  test(`malformed Authorization (${label}) -> 401`, async () => {
    const req = request.get(`${API}/auth/me`);
    if (header !== undefined) req.set("Authorization", header);
    assert.equal((await req).status, 401);
  });
}

test("token in ?token= query string is NOT accepted on JSON API routes", async () => {
  const r = await request.get(`${API}/auth/me?token=${signAccessToken(payload(owner))}`);
  assert.equal(r.status, 401, "query-string tokens leak into logs/referrers");
});

// Tokens carry second-resolution `iat`; sign "older" tokens so revocation at "now" is unambiguous.
const aged = (u) => signAccessToken({ ...payload(u), iat: Math.floor(Date.now() / 1000) - 10 });

test("logout invalidates the token server-side", async () => {
  const t = aged(owner);
  assert.equal((await request.post(`${API}/auth/logout`).set(bearer(t))).status, 200);
  assert.equal((await request.get(`${API}/auth/me`).set(bearer(t))).status, 401, "token still valid after logout");
});

test("deactivated user's existing token is rejected", async () => {
  const u = await new User({ name: "gone", email: "gone@t.local", role: "business_owner", status: "Active", passwordHash: "x".repeat(12) }).save({ validateBeforeSave: false });
  const t = signAccessToken(payload(u));
  await User.updateOne({ _id: u._id }, { status: "Suspended" });
  const r = await request.get(`${API}/auth/me`).set(bearer(t));
  assert.ok([401, 403].includes(r.status), `suspended user token -> ${r.status}`);
});

test("deleted user's existing token is rejected", async () => {
  const u = await new User({ name: "del", email: "del@t.local", role: "business_owner", status: "Active", passwordHash: "x".repeat(12) }).save({ validateBeforeSave: false });
  const t = signAccessToken(payload(u));
  await User.deleteOne({ _id: u._id });
  const r = await request.get(`${API}/auth/me`).set(bearer(t));
  assert.ok([401, 403, 404].includes(r.status), `deleted user token -> ${r.status}`);
});

test("old token rejected after password change", async () => {
  const u = await new User({ name: "pw", email: "pw@t.local", role: "business_owner", status: "Active", passwordHash: await bcrypt.hash("Passw0rd!x", 4), forcePasswordChange: false }).save({ validateBeforeSave: false });
  const old = aged(u);
  const r = await request.patch(`${API}/auth/change-password`).set(bearer(old)).send({ currentPassword: "Passw0rd!x", newPassword: "Another#Pass1", confirmPassword: "Another#Pass1" });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal((await request.get(`${API}/auth/me`).set(bearer(old))).status, 401, "token survived password change");
});

// ---- validation ----
test("login: missing / invalid fields -> 400, never 500", async () => {
  for (const body of [{}, { email: "x" }, { email: "a@b.co" }, { email: "a@b.co", password: 123 }, { email: ["a@b.co"], password: "x" }]) {
    const r = await request.post(`${API}/auth/login`).send(body);
    assert.ok([400, 422].includes(r.status), `${JSON.stringify(body)} -> ${r.status}`);
  }
});

test("login: NoSQL operator injection rejected", async () => {
  const r = await request.post(`${API}/auth/login`).send({ email: { $gt: "" }, password: { $gt: "" } });
  assert.ok([400, 401, 422].includes(r.status), `-> ${r.status}`);
});

test("login: wrong password and unknown email give the same generic 401", async () => {
  const a = await request.post(`${API}/auth/login`).send({ email: "owner@t.local", password: "wrong-pass" });
  const b = await request.post(`${API}/auth/login`).send({ email: "nobody@t.local", password: "wrong-pass" });
  assert.equal(a.status, 401); assert.equal(b.status, 401);
  assert.equal(a.body.message, b.body.message, "response differs -> user enumeration");
});

test("register: invalid payloads -> 400; duplicate -> 409", async () => {
  const bad = [{ name: "A1", email: "x@y.co", password: "123456" }, { name: "Bob", email: "nope", password: "123456" }, { name: "Bob", email: "b@y.co", password: "123" }, { name: "Bob", email: "b@y.co", password: "123456", phone: "12" }];
  for (const b of bad) assert.ok([400, 422].includes((await request.post(`${API}/auth/register`).send(b)).status), JSON.stringify(b));
  const ok = { name: "Dup Person", email: "dup@t.local", password: "Passw0rd!x" };
  const first = await request.post(`${API}/auth/register`).send(ok);
  assert.ok([200, 201].includes(first.status), JSON.stringify(first.body));
  const second = await request.post(`${API}/auth/register`).send(ok);
  assert.equal(second.status, 409, `duplicate -> ${second.status}`);
});

test("register cannot self-assign a privileged role", async () => {
  const r = await request.post(`${API}/auth/register`).send({ name: "Evil Admin", email: "evil@t.local", password: "Passw0rd!x", role: "central_admin" });
  const u = await User.findOne({ email: "evil@t.local" });
  assert.ok(!u || u.role !== "central_admin", `registered as ${u?.role} (status ${r.status})`);
});

test("malformed JSON body -> 400 not 500", async () => {
  const r = await request.post(`${API}/auth/login`).set("Content-Type", "application/json").send('{"email": ');
  assert.equal(r.status, 400, `-> ${r.status}`);
});

test("invalid ObjectId param -> 400 not 500", async () => {
  const t = signAccessToken(payload(admin));
  const r = await request.patch(`${API}/businesses/not-an-id`).set(bearer(t)).send({ name: "x" });
  assert.equal(r.status, 400, `-> ${r.status}`);
});

test("unknown route -> 404 JSON, no stack trace leaked", async () => {
  const r = await request.get(`${API}/does-not-exist`);
  assert.equal(r.status, 404);
  assert.ok(!/at .*\.js:\d+/.test(JSON.stringify(r.body)), "stack trace leaked");
});

// ---- rate limit (last: it burns the per-IP budget) ----
test("login brute force is rate limited (429) within 40 attempts", async () => {
  let got429 = false;
  for (let i = 0; i < 40 && !got429; i++) {
    const r = await request.post(`${API}/auth/login`).send({ email: "owner@t.local", password: `bad-${i}` });
    if (r.status === 429) got429 = true;
  }
  assert.ok(got429, "no 429 after 40 bad logins");
});
