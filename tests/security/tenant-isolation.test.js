// Tenant isolation: Business A actors must never mutate Business B (and vice versa).
// Throwaway local MongoDB only.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const TEST_URI = process.env.QA_MONGODB_URI || "mongodb://localhost:27018/rifah_qa_iso";
process.env.MONGODB_URI = TEST_URI;
process.env.NODE_ENV = "test";
process.env.RATE_LIMIT_MAX_REQUESTS = "100000";

let request, mongoose, User, Business, sign;
const T = {}; // tokens
const ids = {};

before(async () => {
  assert.ok(/localhost|127\.0\.0\.1/.test(TEST_URI), "refusing to run against non-local DB");
  mongoose = (await import("mongoose")).default;
  await mongoose.connect(TEST_URI);
  await mongoose.connection.dropDatabase();
  ({ User } = await import("../../src/modules/users/user.model.js"));
  ({ Business } = await import("../../src/modules/businesses/business.model.js"));
  ({ signAccessToken: sign } = await import("../../src/infrastructure/auth/jwt.js"));
  const { app } = await import("../../src/app.js");
  request = (await import("supertest")).default(app);

  const chA = new mongoose.Types.ObjectId(), chB = new mongoose.Types.ObjectId();
  ids.chA = chA; ids.chB = chB;
  const mk = async (name, role, extra = {}) => {
    const u = await new User({ name, email: `${name}@t.local`, role, status: "Active", password: "x".repeat(12), ...extra }).save({ validateBeforeSave: false });
    T[name] = sign({ id: u._id, email: u.email, role, chapterId: extra.chapterId, state: extra.state || "" });
    return u;
  };
  const ownA = await mk("ownerA", "business_owner", { chapterId: chA, state: "Maharashtra" });
  const ownB = await mk("ownerB", "business_owner", { chapterId: chB, state: "Delhi" });
  await mk("central", "central_admin");
  await mk("chapAdminA", "chapter_admin", { chapterId: chA, state: "Maharashtra" });
  await mk("chapAdminB", "chapter_admin", { chapterId: chB, state: "Delhi" });
  await mk("stateAdminA", "state_admin", { state: "Maharashtra" });
  await mk("stateAdminB", "state_admin", { state: "Delhi" });
  await mk("custA", "customer", { chapterId: chA });
  const bA = await new Business({ name: "Biz A", slug: "biz-a", owner: ownA._id, ownerEmail: ownA.email, chapterId: chA, state: "Maharashtra" }).save({ validateBeforeSave: false });
  const bB = await new Business({ name: "Biz B", slug: "biz-b", owner: ownB._id, ownerEmail: ownB.email, chapterId: chB, state: "Delhi" }).save({ validateBeforeSave: false });
  ids.bA = String(bA._id); ids.bB = String(bB._id);
});
after(async () => { await mongoose?.disconnect(); setTimeout(() => process.exit(0), 50).unref(); });

const as = (who) => ({ Authorization: `Bearer ${T[who]}` });
const nameOf = async (id) => (await Business.findById(id)).name;

test("no token -> 401 on mutate", async () => {
  assert.equal((await request.patch(`/api/v1/businesses/${ids.bB}`).send({ name: "x" })).status, 401);
});

for (const [who, expected] of [["ownerA", 403], ["custA", 403], ["chapAdminA", 403], ["stateAdminA", 403]]) {
  test(`${who} cannot PATCH Business B -> ${expected}`, async () => {
    const r = await request.patch(`/api/v1/businesses/${ids.bB}`).set(as(who)).send({ name: "HACKED" });
    assert.equal(r.status, expected, JSON.stringify(r.body));
    assert.equal(await nameOf(ids.bB), "Biz B");
  });
}

test("ownerA cannot PUT Business B", async () => {
  const r = await request.put(`/api/v1/businesses/${ids.bB}`).set(as("ownerA")).send({ name: "HACKED" });
  assert.equal(r.status, 403);
});

for (const who of ["ownerB", "chapAdminB", "stateAdminB", "central"]) {
  test(`${who} CAN PATCH Business B`, async () => {
    const r = await request.patch(`/api/v1/businesses/${ids.bB}`).set(as(who)).send({ tagline: `by-${who}` });
    assert.equal(r.status, 200, JSON.stringify(r.body));
  });
}

test("ownerA cannot self-escalate protected fields on own business", async () => {
  await request.patch(`/api/v1/businesses/${ids.bA}`).set(as("ownerA")).send({ verification: "Verified", membership: "Gold", featured: true, owner: ids.bB });
  const b = await Business.findById(ids.bA);
  assert.notEqual(b.verification, "Verified");
  assert.equal(b.featured, false);
  assert.notEqual(String(b.owner), ids.bB);
});

for (const who of ["ownerA", "custA", "chapAdminA", "stateAdminA"]) {
  test(`${who} cannot change Business B status`, async () => {
    const r = await request.patch(`/api/v1/businesses/${ids.bB}/status`).set(as(who)).send({ verification: "Verified" });
    assert.ok([403, 404].includes(r.status), `${who} got ${r.status}`);
    assert.notEqual((await Business.findById(ids.bB)).verification, "Verified");
  });
}

test("ownerA upload to Business B is denied AND no file is stored", async () => {
  const { File } = await import("../../src/modules/files/file.model.js");
  const before = await File.countDocuments();
  const png = Buffer.from("\x89PNG\r\n\x1a\n");
  for (const [route, field] of [["logo", "logo"], ["cover", "cover"], ["gallery", "gallery"], ["certificates", "certificate"]]) {
    const r = await request.post(`/api/v1/businesses/${ids.bB}/${route}`).set(as("ownerA")).attach(field, png, { filename: "x.png", contentType: "image/png" });
    assert.ok([401, 403, 404].includes(r.status), `${route}: status ${r.status} ${JSON.stringify(r.body)}`);
  }
  assert.equal(await File.countDocuments(), before, "unauthorized uploads were persisted before authz check");
  const b = await Business.findById(ids.bB);
  assert.deepEqual([...(b.gallery || [])], [], "gallery of Business B was modified");
});

test("ownerA GET /businesses/me returns only own business", async () => {
  const r = await request.get("/api/v1/businesses/me").set(as("ownerA"));
  assert.equal(r.status, 200);
  assert.equal(String(r.body.data?._id || r.body.data?.id), ids.bA);
});

test("forged token (wrong secret) rejected", async () => {
  const jwt = (await import("jsonwebtoken")).default;
  const bad = jwt.sign({ id: ids.bA, role: "central_admin" }, "not-the-secret");
  assert.equal((await request.get("/api/v1/auth/me").set({ Authorization: `Bearer ${bad}` })).status, 401);
});

test("customer token cannot hit admin-only routes", async () => {
  const r = await request.post("/api/v1/businesses/admin/create").set(as("custA")).send({ name: "x" });
  assert.equal(r.status, 403);
});
