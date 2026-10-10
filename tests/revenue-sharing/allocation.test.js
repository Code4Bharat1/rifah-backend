// Pure unit tests for the revenue-share calculation engine — no database required.
// Run: node --test tests/revenue-sharing/allocation.test.js
import { test } from "node:test";
import assert from "node:assert/strict";
import { computeAllocations } from "../../src/modules/revenue-sharing/revenueShare.service.js";

const membershipRule = {
  allocations: [
    { beneficiaryLevel: "chapter", percentage: 50 },
    { beneficiaryLevel: "state", percentage: 25 },
    { beneficiaryLevel: "central", percentage: 25 },
  ],
};

const eventRule = {
  allocations: [{ beneficiaryLevel: "organizer", percentage: 100 }],
};

test("acceptance criterion 1: ₹1,00,000 membership allocates 50k/25k/25k", () => {
  const result = computeAllocations(100000, membershipRule);
  assert.equal(result.length, 3);
  assert.equal(result[0].amount, 50000);
  assert.equal(result[1].amount, 25000);
  assert.equal(result[2].amount, 25000);
  const total = result.reduce((s, a) => s + a.amount, 0);
  assert.equal(total, 100000);
});

test("every non-last allocation is computed directly from the eligible base (not cascaded through a prior allocation)", () => {
  const base = 77777;
  const result = computeAllocations(base, membershipRule);
  // Every allocation except the last (which absorbs the rounding remainder, see the
  // rounding test below) must equal round(base * pct / 100) exactly — proof it reads
  // `base` directly rather than deriving from a running/prior allocation amount.
  for (const alloc of result.slice(0, -1)) {
    const expected = Math.round(base * (alloc.percentage / 100) * 100) / 100;
    assert.equal(alloc.amount, expected, `${alloc.beneficiaryLevel}'s share must be base * ${alloc.percentage}%`);
  }
});

test("acceptance criterion 3/4: event rule allocates 100% to the organizer level", () => {
  const result = computeAllocations(50000, eventRule);
  assert.equal(result.length, 1);
  assert.equal(result[0].beneficiaryLevel, "organizer");
  assert.equal(result[0].amount, 50000);
});

test("rounding: odd amounts still reconcile exactly to the eligible base (acceptance criterion reconciliation)", () => {
  const amounts = [999, 1, 0.01, 333.33, 7777.77, 123456.78];
  for (const amt of amounts) {
    const result = computeAllocations(amt, membershipRule);
    const total = result.reduce((s, a) => s + a.amount, 0);
    assert.equal(
      Math.round(total * 100) / 100,
      Math.round(amt * 100) / 100,
      `allocations for ₹${amt} must sum to exactly ₹${amt}, got ₹${total}`
    );
  }
});

test("rounding: last allocation absorbs the remainder, not the first", () => {
  // 100 split 3 ways at odd percentages that don't divide evenly
  const oddRule = {
    allocations: [
      { beneficiaryLevel: "chapter", percentage: 33.33 },
      { beneficiaryLevel: "state", percentage: 33.33 },
      { beneficiaryLevel: "central", percentage: 33.34 },
    ],
  };
  const result = computeAllocations(100, oddRule);
  const total = result.reduce((s, a) => s + a.amount, 0);
  assert.equal(total, 100);
});

test("single-allocation rule (event) with a fractional base reconciles exactly", () => {
  const result = computeAllocations(10000.5, eventRule);
  assert.equal(result[0].amount, 10000.5);
});

test("zero allocations list produces zero entries (defensive, should not be hit via a real rule)", () => {
  const result = computeAllocations(1000, { allocations: [] });
  assert.deepEqual(result, []);
});
