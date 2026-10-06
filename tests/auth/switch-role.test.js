// Regression: a Central Admin who switches into the Business workspace must keep that
// session role across /auth/me and /auth/refresh-token, and tenants must stay isolated.
// Runs against a throwaway MongoDB only (never the configured production URI).
import { test, before, after } from "node:test";
import assert from "node:assert/strict";

const TEST_URI = process.env.QA_MONGODB_URI || "mongodb://localhost:27018/rifah_qa";
process.env.MONGODB_URI = TEST_URI;
process.env.NODE_ENV = "test";
process.env.RATE_LIMIT_MAX_REQUESTS = "100000";

let request, mongoose, User, Business, signAccessToken, signRefreshToken;
let admin, adminToken, adminRefresh, plainAdmin, plainAdminToken;

before(async () => {
  assert.ok(/localhost|127\.0\.0\.1/.test(TEST_URI), "refusing to run against non-local DB");
  mongoose = (await import("mongoose")).default;
  await mongoose.connect(TEST_URI);
  await mongoose.connection.dropDatabase();
  ({ User } = await import("../../src/modules/users/user.model.js"));
  ({ Business } = await import("../../src/modules/businesses/business.model.js"));
  ({ signAccessToken, signRefreshToken } = await import("../../src/infrastructure/auth/jwt.js"));
  const { app } = await import("../../src/app.js");
  request = (await import("supertest")).default(app);

  const mk = async (doc) => {
    const u = new User({ status: "Active", password: "x".repeat(12), ...doc });
    await u.save({ validateBeforeSave: false });
    return u;
  };
  admin = await mk({ name: "Central A", email: "ca@test.local", role: "central_admin" });
  plainAdmin = await mk({ name: "Central B", email: "cb@test.local", role: "central_admin" });
  const b = new Business({ name: "Biz A", slug: "biz-a", owner: admin._id, ownerEmail: admin.email, email: admin.email });
  await b.save({ validateBeforeSave: false });

  const payload = (u) => ({ id: u._id, email: u.email, role: u.role });
  adminToken = signAccessToken(payload(admin));
  adminRefresh = signRefreshToken(payload(admin));
  plainAdminToken = signAccessToken(payload(plainAdmin));
});

after(async () => {
  await mongoose?.disconnect();
  setTimeout(() => process.exit(0), 50).unref();
});

const auth = (t) => ({ Authorization: `Bearer ${t}` });

test("switch-role issues business_owner token with previousRole", async () => {
  const res = await request.post("/api/v1/auth/switch-role").set(auth(adminToken)).send({ targetRole: "business_owner" });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.equal(res.body.data.user.role, "business_owner");
  assert.equal(res.body.data.user.previousRole, "central_admin");
  globalThis.__sw = res.body.data;
});

test("GET /auth/me with business_owner session token still reports business_owner + previousRole", async () => {
  const res = await request.get("/api/v1/auth/me").set(auth(globalThis.__sw.accessToken));
  assert.equal(res.status, 200);
  assert.equal(res.body.data.role, "business_owner", "me() reverted session role to DB role");
  assert.equal(res.body.data.previousRole, "central_admin", "me() dropped previousRole (no way back)");
});

test("refresh-token on business_owner session keeps business_owner role", async () => {
  const res = await request.post("/api/v1/auth/refresh-token").send({ refreshToken: globalThis.__sw.refreshToken });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  const me = await request.get("/api/v1/auth/me").set(auth(res.body.data.accessToken));
  assert.equal(me.body.data.role, "business_owner", "refresh re-signed token with DB role");
});

test("admin without a business cannot switch to business_owner", async () => {
  const res = await request.post("/api/v1/auth/switch-role").set(auth(plainAdminToken)).send({ targetRole: "business_owner" });
  assert.equal(res.status, 400);
});

test("DB role is never mutated by switching", async () => {
  const u = await User.findById(admin._id);
  assert.equal(u.role, "central_admin");
});

test("switch back to central_admin works from business session", async () => {
  const res = await request.post("/api/v1/auth/switch-role").set(auth(globalThis.__sw.accessToken)).send({ targetRole: "central_admin" });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.equal(res.body.data.user.role, "central_admin");
});
