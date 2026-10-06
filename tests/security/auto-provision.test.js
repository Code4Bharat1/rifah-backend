// GET /businesses/me must not create businesses for non-business accounts (it used to
// auto-create a *verified* business, which getMe() then used to promote customers/admins).
import { test, before, after } from "node:test";
import assert from "node:assert/strict";

const TEST_URI = process.env.QA_MONGODB_URI || "mongodb://localhost:27018/rifah_qa_prov";
process.env.MONGODB_URI = TEST_URI;
process.env.NODE_ENV = "test";
process.env.RATE_LIMIT_MAX_REQUESTS = "100000";

let request, mongoose, User, Business, sign;
const T = {}, U = {};

before(async () => {
  assert.ok(/localhost|127\.0\.0\.1/.test(TEST_URI), "refusing to run against non-local DB");
  mongoose = (await import("mongoose")).default;
  await mongoose.connect(TEST_URI);
  await mongoose.connection.dropDatabase();
  ({ User } = await import("../../src/modules/users/user.model.js"));
  ({ Business } = await import("../../src/modules/businesses/business.model.js"));
  ({ signAccessToken: sign } = await import("../../src/infrastructure/auth/jwt.js"));
  request = (await import("supertest")).default((await import("../../src/app.js")).app);
  for (const role of ["customer", "central_admin", "chapter_admin", "state_admin", "secretariat", "business_owner"]) {
    const u = await new User({ name: role, email: `${role}@t.local`, role, status: "Active", passwordHash: "x".repeat(12) }).save({ validateBeforeSave: false });
    U[role] = u; T[role] = sign({ id: u._id, email: u.email, role });
  }
});
after(async () => { await mongoose?.disconnect(); setTimeout(() => process.exit(0), 50).unref(); });

for (const role of ["customer", "central_admin", "chapter_admin", "state_admin", "secretariat"]) {
  test(`${role}: GET /businesses/me creates no business and role is unchanged`, async () => {
    const r = await request.get("/api/v1/businesses/me").set({ Authorization: `Bearer ${T[role]}` });
    assert.equal(r.status, 200);
    assert.equal(await Business.countDocuments({ owner: U[role]._id }), 0, "business was auto-created");
    await request.get("/api/v1/auth/me").set({ Authorization: `Bearer ${T[role]}` });
    assert.equal((await User.findById(U[role]._id)).role, role, "role was changed in DB");
  });
}
