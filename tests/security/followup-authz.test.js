// Followups hold member PII (phone/email). Only chamber admins (scoped to their own chapter)
// or event-assigned coordinators may touch them. Throwaway local MongoDB only.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";

const TEST_URI = process.env.QA_MONGODB_URI || "mongodb://localhost:27018/rifah_qa_followup";
process.env.MONGODB_URI = TEST_URI;
process.env.NODE_ENV = "test";
process.env.RATE_LIMIT_MAX_REQUESTS = "100000";

let request, mongoose, Followup, sign;
const T = {};
let fuB;

before(async () => {
  assert.ok(/localhost|127\.0\.0\.1/.test(TEST_URI), "refusing to run against non-local DB");
  mongoose = (await import("mongoose")).default;
  await mongoose.connect(TEST_URI);
  await mongoose.connection.dropDatabase();
  const { User } = await import("../../src/modules/users/user.model.js");
  const { Chapter } = await import("../../src/modules/chapters/chapter.model.js");
  ({ Followup } = await import("../../src/modules/followups/followup.model.js"));
  ({ signAccessToken: sign } = await import("../../src/infrastructure/auth/jwt.js"));
  request = (await import("supertest")).default((await import("../../src/app.js")).app);

  const chA = await new Chapter({ name: "Alpha Chapter", slug: "alpha", city: "A", state: "Maharashtra" }).save({ validateBeforeSave: false });
  const chB = await new Chapter({ name: "Bravo Chapter", slug: "bravo", city: "B", state: "Delhi" }).save({ validateBeforeSave: false });
  const mk = async (name, role, extra = {}) => {
    const u = await new User({ name, email: `${name}@t.local`, role, status: "Active", password: "x".repeat(12), ...extra }).save({ validateBeforeSave: false });
    T[name] = sign({ id: u._id, email: u.email, role, chapter: extra.chapter, chapterId: extra.chapterId, state: extra.state || "" });
  };
  await mk("custA", "customer", { chapter: "Alpha Chapter", chapterId: chA._id });
  await mk("ownerA", "business_owner", { chapter: "Alpha Chapter", chapterId: chA._id });
  await mk("chapAdminA", "chapter_admin", { chapter: "Alpha Chapter", chapterId: chA._id, state: "Maharashtra" });
  await mk("chapAdminB", "chapter_admin", { chapter: "Bravo Chapter", chapterId: chB._id, state: "Delhi" });
  fuB = await Followup.create({ type: "membership", chapter: "Bravo Chapter", name: "Bob", mobile: "9999999999", status: "pending" });
});
after(async () => { await mongoose?.disconnect(); setTimeout(() => process.exit(0), 50).unref(); });

const as = (w) => ({ Authorization: `Bearer ${T[w]}` });
const API = "/api/v1/followups";

for (const who of ["custA", "ownerA"]) {
  test(`${who} (non-admin) is denied on followup endpoints`, async () => {
    const calls = [
      request.get(`${API}/stats`).set(as(who)),
      request.post(API).set(as(who)).send({ name: "x", mobile: "1", type: "membership", chapter: "Bravo Chapter" }),
      request.post(`${API}/sync/members`).set(as(who)).send({ chapter: "Bravo" }),
      request.post(`${API}/sync-event/${new mongoose.Types.ObjectId()}`).set(as(who)),
      request.delete(`${API}/${fuB._id}`).set(as(who)),
    ];
    for (const r of await Promise.all(calls)) assert.equal(r.status, 403, `${who}: ${r.req.method} ${r.req.path} -> ${r.status}`);
    assert.ok(await Followup.findById(fuB._id), "followup was deleted by non-admin");
  });
}

test("chapAdminA cannot delete / mutate chapter B followup", async () => {
  const d = await request.delete(`${API}/${fuB._id}`).set(as("chapAdminA"));
  assert.ok([403, 404].includes(d.status), `delete -> ${d.status}`);
  const n = await request.post(`${API}/${fuB._id}/note`).set(as("chapAdminA")).send({ content: "x" });
  assert.ok([403, 404].includes(n.status), `note -> ${n.status}`);
  assert.ok(await Followup.findById(fuB._id));
});

test("chapAdminA cannot sync chapter B members", async () => {
  const r = await request.post(`${API}/sync/members`).set(as("chapAdminA")).send({ chapter: "Bravo Chapter" });
  assert.equal(r.status, 403, `-> ${r.status}`);
});

test("chapAdminB can still manage own chapter followup", async () => {
  const n = await request.post(`${API}/${fuB._id}/note`).set(as("chapAdminB")).send({ content: "ok" });
  assert.equal(n.status, 200, JSON.stringify(n.body));
  const s = await request.get(`${API}/stats`).set(as("chapAdminB"));
  assert.equal(s.status, 200);
});
