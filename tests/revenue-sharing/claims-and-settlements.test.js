// Integration tests for the revenue-sharing claims/settlement workflow: balance
// calculation, over-balance rejection, approve-does-not-reduce-balance, partial
// settlement, duplicate-settlement idempotency, and chapter/state permission scoping.
//
// Runs against a throwaway MongoDB only — refuses to run against anything but
// localhost/127.0.0.1, same guard as tests/auth/switch-role.test.js. Requires a
// replica-set-capable local Mongo (RevenueClaim.service.js's recordSettlement uses a
// Mongoose transaction) — a plain standalone `mongod` will fail at the transaction step;
// see docs/revenue-sharing.md for how to start one (`mongod --replSet rs0` + `rs.initiate()`).
import { test, before, after } from "node:test";
import assert from "node:assert/strict";

const TEST_URI =
  process.env.QA_MONGODB_URI || "mongodb://localhost:27018/rifah_qa";
process.env.MONGODB_URI = TEST_URI;
process.env.NODE_ENV = "test";
process.env.RATE_LIMIT_MAX_REQUESTS = "100000";

let mongoose, User, Chapter, Business, RevenueLedgerEntry, RevenueShareRule;
let revenueClaimService;
let chapterA, chapterB, stateAUser, chapterAAdmin, chapterBAdmin, centralAdmin;

const PERIOD = "2026-01";

before(async () => {
  assert.ok(
    /localhost|127\.0\.0\.1/.test(TEST_URI),
    "refusing to run against non-local DB",
  );
  mongoose = (await import("mongoose")).default;
  await mongoose.connect(TEST_URI);
  await mongoose.connection.dropDatabase();

  ({ User } = await import("../../src/modules/users/user.model.js"));
  ({ Chapter } = await import("../../src/modules/chapters/chapter.model.js"));
  ({ Business } =
    await import("../../src/modules/businesses/business.model.js"));
  ({ RevenueLedgerEntry } =
    await import("../../src/modules/revenue-sharing/revenueLedgerEntry.model.js"));
  ({ RevenueShareRule } =
    await import("../../src/modules/revenue-sharing/revenueShareRule.model.js"));
  revenueClaimService = (
    await import("../../src/modules/revenue-sharing/revenueClaim.service.js")
  ).default;

  chapterA = await Chapter.create({
    name: "Mumbai Chapter",
    slug: "mumbai-chapter",
    city: "Mumbai",
    state: "Maharashtra",
  });
  chapterB = await Chapter.create({
    name: "Pune Chapter",
    slug: "pune-chapter",
    city: "Pune",
    state: "Maharashtra",
  });

  const mk = (doc) =>
    new User({ status: "Active", password: "x".repeat(12), ...doc }).save({
      validateBeforeSave: false,
    });
  centralAdmin = await mk({
    name: "Central",
    email: "central@test.local",
    role: "central_admin",
  });
  chapterAAdmin = await mk({
    name: "Chapter A Admin",
    email: "chapA@test.local",
    role: "chapter_admin",
    chapter: chapterA.name,
    chapterId: chapterA._id,
  });
  chapterBAdmin = await mk({
    name: "Chapter B Admin",
    email: "chapB@test.local",
    role: "chapter_admin",
    chapter: chapterB.name,
    chapterId: chapterB._id,
  });
  stateAUser = await mk({
    name: "State Admin",
    email: "state@test.local",
    role: "state_admin",
    state: "Maharashtra",
  });

  const rule = await RevenueShareRule.create({
    revenueType: "membership",
    allocations: [
      { beneficiaryLevel: "chapter", percentage: 50 },
      { beneficiaryLevel: "state", percentage: 25 },
      { beneficiaryLevel: "central", percentage: 25 },
    ],
    version: 1,
    effectiveFrom: new Date("2026-01-01"),
    isActive: true,
  });

  // Seed a known ledger entry directly (bypassing the full payment flow, which needs a
  // real Payment/Business/Razorpay context) — ₹1,00,000 eligible base, Chapter A's 50%
  // share = ₹50,000, status "payable" (unclaimed, outstanding).
  await RevenueLedgerEntry.create({
    sourcePaymentId: new mongoose.Types.ObjectId(),
    sourceReference: { type: "membership", refId: null },
    revenueType: "membership",
    chapterId: chapterA._id,
    chapter: chapterA.name,
    state: "Maharashtra",
    grossAmount: 100000,
    eligibleBase: 100000,
    ruleId: rule._id,
    ruleVersion: rule.version,
    beneficiaryLevel: "chapter",
    percentage: 50,
    allocatedAmount: 50000,
    accountingPeriod: PERIOD,
    transactionDate: new Date("2026-01-15"),
    status: "payable",
  });
});

after(async () => {
  await mongoose?.disconnect();
  setTimeout(() => process.exit(0), 50).unref();
});

test("acceptance criterion 2: Chapter A's balance is exactly ₹50,000, independent of any State liability", async () => {
  const balance = await revenueClaimService.getOrgBalance(
    "chapter",
    chapterA._id,
  );
  assert.equal(balance.outstanding, 50000);
  assert.equal(balance.totalEarned, 50000);
  assert.equal(balance.totalSettled, 0);
});

test("Chapter B (no ledger entries) has zero balance — not Chapter A's", async () => {
  const balance = await revenueClaimService.getOrgBalance(
    "chapter",
    chapterB._id,
  );
  assert.equal(balance.outstanding, 0);
});

test("acceptance criterion 6: a claim exceeding outstanding balance is rejected", async () => {
  await assert.rejects(
    () =>
      revenueClaimService.createClaim(
        {
          id: chapterAAdmin._id,
          role: "chapter_admin",
          chapterId: chapterA._id,
        },
        { claimedAmount: 60000, periodFrom: PERIOD, periodTo: PERIOD },
      ),
    /exceeds the eligible outstanding balance/,
  );
});

test("permissions: Chapter B admin cannot create a claim for Chapter A", async () => {
  // resolveOwnBeneficiary always resolves to the CALLER's own chapter — Chapter B admin
  // can only ever create a claim scoped to Chapter B, never Chapter A, regardless of
  // what's in the request body. Confirm the created claim is scoped to B, not A.
  const claim = await revenueClaimService.createClaim(
    { id: chapterBAdmin._id, role: "chapter_admin", chapterId: chapterB._id },
    { claimedAmount: 1, periodFrom: PERIOD, periodTo: PERIOD },
  );
  assert.equal(String(claim.chapterId), String(chapterB._id));
  assert.notEqual(String(claim.chapterId), String(chapterA._id));
  await revenueClaimService.cancelClaim(
    { id: chapterBAdmin._id, role: "chapter_admin" },
    claim._id,
  );
});

test("chapter membership claims default to the state payer, and state admins can settle their own state claims", async () => {
  const chapterClaim = await revenueClaimService.createClaim(
    { id: chapterAAdmin._id, role: "chapter_admin", chapterId: chapterA._id },
    {
      claimedAmount: 1,
      periodFrom: PERIOD,
      periodTo: PERIOD,
      revenueType: "membership",
    },
  );
  assert.equal(chapterClaim.revenueType, "membership");
  assert.equal(chapterClaim.payingOrgLevel, "state");

  const stateClaim = await revenueClaimService.createClaim(
    { id: stateAUser._id, role: "state_admin", state: "Maharashtra" },
    {
      claimedAmount: 1,
      periodFrom: PERIOD,
      periodTo: PERIOD,
      revenueType: "membership",
    },
  );
  assert.equal(stateClaim.beneficiaryLevel, "state");
  assert.equal(stateClaim.payingOrgLevel, "central");

  await revenueClaimService.approveClaim(
    { id: centralAdmin._id, role: "central_admin" },
    stateClaim._id,
  );
  await revenueClaimService.recordSettlement(
    { id: stateAUser._id, role: "state_admin" },
    stateClaim._id,
    {
      amount: 1,
      method: "Bank Transfer",
      idempotencyKey: "state-settle-1",
    },
  );
  const settlement = await revenueClaimService.recordSettlement(
    { id: stateAUser._id, role: "state_admin" },
    stateClaim._id,
    {
      amount: 1,
      method: "Bank Transfer",
      idempotencyKey: "state-settle-1",
    },
  );
  assert.ok(settlement);
});

let claimId;

test("a valid claim can be created, submitted and approved without changing the outstanding balance", async () => {
  const claim = await revenueClaimService.createClaim(
    { id: chapterAAdmin._id, role: "chapter_admin", chapterId: chapterA._id },
    {
      claimedAmount: 50000,
      periodFrom: PERIOD,
      periodTo: PERIOD,
      notes: "Q1 claim",
    },
  );
  claimId = claim._id;
  assert.equal(claim.status, "draft");

  await revenueClaimService.submitClaim(
    { id: chapterAAdmin._id, role: "chapter_admin" },
    claimId,
  );
  const balanceAfterSubmit = await revenueClaimService.getOrgBalance(
    "chapter",
    chapterA._id,
  );
  assert.equal(
    balanceAfterSubmit.outstanding,
    50000,
    "submitting must not change outstanding balance",
  );

  const approved = await revenueClaimService.approveClaim(
    { id: centralAdmin._id, role: "central_admin" },
    claimId,
  );
  assert.equal(approved.status, "approved");
  const balanceAfterApprove = await revenueClaimService.getOrgBalance(
    "chapter",
    chapterA._id,
  );
  assert.equal(
    balanceAfterApprove.outstanding,
    50000,
    "approving must not change outstanding balance",
  );
});

test("acceptance criterion 7: a partial settlement reduces the outstanding balance by exactly the settled amount", async () => {
  await revenueClaimService.recordSettlement(
    { id: centralAdmin._id, role: "central_admin" },
    claimId,
    {
      amount: 20000,
      method: "Bank Transfer",
      idempotencyKey: "test-settle-1",
    },
  );

  const balance = await revenueClaimService.getOrgBalance(
    "chapter",
    chapterA._id,
  );
  assert.equal(
    balance.outstanding,
    30000,
    "₹50,000 earned - ₹20,000 settled = ₹30,000 outstanding",
  );
  assert.equal(balance.totalSettled, 20000);
});

test("duplicate settlement (same idempotencyKey) is a no-op, not a second payment", async () => {
  const first = await revenueClaimService.recordSettlement(
    { id: centralAdmin._id, role: "central_admin" },
    claimId,
    {
      amount: 20000,
      method: "Bank Transfer",
      idempotencyKey: "test-settle-1", // same key as the previous test
    },
  );
  const balance = await revenueClaimService.getOrgBalance(
    "chapter",
    chapterA._id,
  );
  assert.equal(
    balance.outstanding,
    30000,
    "balance must be unchanged by the duplicate call",
  );
  assert.equal(balance.totalSettled, 20000);
  assert.ok(
    first,
    "duplicate call returns the original settlement, not an error",
  );
});

test("remaining balance can be settled, bringing the claim to fully paid", async () => {
  await revenueClaimService.recordSettlement(
    { id: centralAdmin._id, role: "central_admin" },
    claimId,
    {
      amount: 30000,
      method: "Bank Transfer",
      idempotencyKey: "test-settle-2",
    },
  );
  const balance = await revenueClaimService.getOrgBalance(
    "chapter",
    chapterA._id,
  );
  assert.equal(balance.outstanding, 0);
  assert.equal(balance.totalSettled, 50000);
});

test("acceptance criterion 5: a new, separate payable entry for a later period carries forward and adds to (not replaces) the now-zero balance", async () => {
  const rule = await RevenueShareRule.findOne({ revenueType: "membership" });
  await RevenueLedgerEntry.create({
    sourcePaymentId: new mongoose.Types.ObjectId(),
    sourceReference: { type: "membership", refId: null },
    revenueType: "membership",
    chapterId: chapterA._id,
    chapter: chapterA.name,
    state: "Maharashtra",
    grossAmount: 20000,
    eligibleBase: 20000,
    ruleId: rule._id,
    ruleVersion: rule.version,
    beneficiaryLevel: "chapter",
    percentage: 50,
    allocatedAmount: 10000,
    accountingPeriod: "2026-02",
    transactionDate: new Date("2026-02-05"),
    status: "payable",
  });
  const balance = await revenueClaimService.getOrgBalance(
    "chapter",
    chapterA._id,
  );
  assert.equal(
    balance.outstanding,
    10000,
    "new earnings must ADD to the prior (now-zero) balance, never reset it",
  );
});
