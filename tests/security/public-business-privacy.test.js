// Anonymous / non-privileged viewers must not receive owner PII or admin-only business fields.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";

const TEST_URI = process.env.QA_MONGODB_URI || "mongodb://localhost:27018/rifah_qa_privacy";
process.env.MONGODB_URI = TEST_URI;
process.env.NODE_ENV = "test";
process.env.RATE_LIMIT_MAX_REQUESTS = "100000";

let request, mongoose, T = {}, bizA;
const HIDDEN = ["ownerEmail", "taxId", "dob", "adminRemark", "adminUpdateAcknowledged", "adminUpdateChanges", "verificationHistory", "verificationRemarks", "verificationReviewReason", "membershipId", "paymentStatus", "isPaid", "lastBirthdayWishYear", "lastAnniversaryWishYear", "__v"];

before(async () => {
  assert.ok(/localhost|127\.0\.0\.1/.test(TEST_URI));
  mongoose = (await import("mongoose")).default;
  await mongoose.connect(TEST_URI); await mongoose.connection.dropDatabase();
  const { User } = await import("../../src/modules/users/user.model.js");
  const { Business } = await import("../../src/modules/businesses/business.model.js");
  const { signAccessToken: sign } = await import("../../src/infrastructure/auth/jwt.js");
  request = (await import("supertest")).default((await import("../../src/app.js")).app);
  const mk = async (name, role) => { const u = await new User({ name, email: `${name}@t.local`, phone: "9876543210", role, status: "Active", passwordHash: "x".repeat(12) }).save({ validateBeforeSave: false }); T[name] = sign({ id: u._id, email: u.email, role }); return u; };
  const a = await mk("ownerA", "business_owner"); await mk("ownerB", "business_owner"); await mk("central", "central_admin");
  bizA = await new Business({ name: "Biz A", slug: "biz-a", owner: a._id, ownerEmail: a.email, email: "info@biza.test", phone: "02212345678", taxId: "27ABCDE1234F1Z5", adminRemark: "internal note", verificationRemarks: "x", status: "Active", verification: "Verified" }).save({ validateBeforeSave: false });
});
after(async () => { await mongoose?.disconnect(); setTimeout(() => process.exit(0), 50).unref(); });

const listOf = (r) => (Array.isArray(r.body.data) ? r.body.data : r.body.data?.businesses || r.body.data?.items || []);
const leaks = (b) => [...HIDDEN.filter((k) => b[k] !== undefined && b[k] !== null && b[k] !== "" && !(Array.isArray(b[k]) && !b[k].length)), ...(b.owner?.email ? ["owner.email"] : []), ...(b.owner?.phone ? ["owner.phone"] : [])];

for (const [label, hdr] of [["anonymous", {}], ["other owner", { Authorization: "dummy" }]]) {
  test(`${label}: directory list hides PII/admin fields`, async () => {
    const h = label === "anonymous" ? {} : { Authorization: `Bearer ${T.ownerB}` };
    const b = listOf(await request.get("/api/v1/businesses?limit=5").set(h)).find((x) => x.slug === "biz-a");
    assert.ok(b);
    assert.deepEqual(leaks(b), []);
    assert.equal(b.email, "info@biza.test", "public business contact email must remain");
  });
  test(`${label}: detail by slug and id hides PII/admin fields`, async () => {
    const h = label === "anonymous" ? {} : { Authorization: `Bearer ${T.ownerB}` };
    for (const p of [`/api/v1/businesses/biz-a`, `/api/v1/businesses/detail/biz-a`, `/api/v1/businesses/${bizA._id}`]) {
      const r = await request.get(p).set(h);
      assert.equal(r.status, 200, p);
      assert.deepEqual(leaks(r.body.data), [], p);
    }
  });
}

test("owner and central admin still receive the full record", async () => {
  for (const who of ["ownerA", "central"]) {
    const r = await request.get("/api/v1/businesses/biz-a").set({ Authorization: `Bearer ${T[who]}` });
    assert.equal(r.body.data.taxId, "27ABCDE1234F1Z5", `${who} lost taxId`);
    assert.equal(r.body.data.adminRemark, "internal note", `${who} lost adminRemark`);
  }
});
