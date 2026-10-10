# Revenue Sharing & Settlement

How membership and event payments collected by the Center get allocated to Chapters and
States, tracked as outstanding balances, claimed, and settled.

## 1. Calculation rules

### Membership revenue

Every paid membership payment (`Payment.itemType === "Membership"`, no `eventId`) splits
its **eligible base** three ways, each an independent share of the same base — not
cascaded through each other:

| Beneficiary | Share |
|---|---|
| Member's Chapter | 50% |
| Chapter's State | 25% |
| Central | 25% |

**Worked example** — ₹1,00,000 eligible membership amount:

- Chapter allocation: ₹50,000
- State allocation: ₹25,000
- Central allocation: ₹25,000
- Total allocated: ₹1,00,000

The Chapter's 50% is calculated from the eligible base directly (₹1,00,000 × 50%), **not**
from the State's ₹25,000 share. Central's own 25% is not a liability to anyone — it's
recorded (for audit/reporting completeness) with status `"paid"` immediately, since the
Center cannot owe itself.

### Event revenue

Every paid event registration or delegation installment (`Payment.eventId` set) allocates
**100% of eligible revenue** to whichever organization level organized the event, resolved
from the event's existing `visibilityScope` field:

| Event's `visibilityScope` | Beneficiary |
|---|---|
| `"chapter"` | That Chapter — 100% |
| `"state"` | That State — 100% |
| `"global"` (Central-organized) | No beneficiary — Central retains it directly, no ledger entries created |

Membership-sharing rules never apply to event revenue, and vice versa.

### Eligible allocation base

The **eligible base** is `Payment.subtotal` — the pre-GST, pre-TCS amount. GST and TCS are
never distributable revenue; they're excluded from the base by construction, reusing the
existing `subtotal`/`gstAmount`/`tcsAmount` fields already on `Payment` (no new GST
calculation was introduced).

> **Known data quirk, handled defensively**: `payment.service.js`'s payment-creation paths
> only populate `subtotal` when a GST/duration/event condition fires during that payment's
> creation; otherwise it's left at its schema default of `0` while `payment.amount` already
> correctly holds the pre-GST base in that case. `createLedgerEntriesForPayment` falls back
> to `payment.amount` when `subtotal` is `0`/unset, so the eligible base is never wrongly
> zero for a real paid payment.

### Rounding policy

Each allocation is rounded to 2 decimal places (paise). The **last** allocation in a rule
absorbs whatever rounding remainder is left, so the allocations for any payment always sum
*exactly* to the eligible base — never a paisa over or under, regardless of how the
percentages round individually. See `computeAllocations()` in
`src/modules/revenue-sharing/revenueShare.service.js`.

### Rule versioning

Rules are configurable per revenue type (`membership` | `event`), versioned, and
effective-dated (`RevenueShareRule` model). A payment always uses whichever rule version
was active on its transaction date — publishing a new rule version (`POST
/revenue-sharing/rules`) never recalculates past allocations; it only affects payments
from its `effectiveFrom` date onward. The previous open-ended version is automatically
closed out (`effectiveTo` set) when a new one is published.

## 2. Data model

| Model | Purpose |
|---|---|
| `RevenueShareRule` | Versioned, effective-dated split percentages per revenue type. |
| `RevenueLedgerEntry` | One row per beneficiary allocation per payment. The source of truth — never mutated after creation except its `status`/`paidAmount` as settlements apply. |
| `RevenueAdjustment` | Refunds/chargebacks/corrections — always a new row linked to a ledger entry, never an edit to the original. |
| `RevenueClaim` | A Chapter/State's claim against its outstanding balance. |
| `RevenueSettlement` | Actual money paid against an approved claim. Idempotent via a required unique `idempotencyKey`. |

Outstanding balance for an organization is **always computed** by summing
`RevenueLedgerEntry.allocatedAmount` (minus `RevenueAdjustment`s, minus
`RevenueSettlement`s) — never read from a stored, hand-editable total. See
`getOrgBalance()` / `getOrgPeriodSummary()` in `revenueClaim.service.js`.

## 3. Claim → settlement state machine

```
draft → submitted → under_review → approved → partially_paid → paid
                  ↘ rejected (reason required)
  (any non-terminal state) → cancelled
```

- **Submitting or approving a claim never changes the outstanding balance.**
- Only `recordSettlement()` reduces it, by exactly the amount actually paid — never the
  claimed amount. A claim can have multiple settlements (partial payments).
- A claim cannot be created for more than the current outstanding balance, unless
  explicitly overridden by Central Admin with a logged reason (`overrideApproved` +
  `overrideReason` on the claim).

## 4. Permissions

| Role | Ledger / Dashboard | Claims | Settlements | Rules |
|---|---|---|---|---|
| Central Admin | All organizations | Review/approve/reject all | Record (only role that can) | Configure |
| State Admin | Own state + its chapters | Submit for own state; view own chapters' (read-only) | — | View only |
| Chapter Admin | Own chapter only | Submit for own chapter | — | View only |
| Anyone else | No access | No access | No access | No access |

Enforced server-side (not just hidden in the UI) by reusing the existing
`shared/utils/chapter-scope.js` `getChapterFilter(user, "direct_id")` utility — the ledger
model's `chapterId`/`chapter`/`state` fields are shaped specifically to match it.

## 5. Where ledger entries get created

`revenueShareService.createLedgerEntriesForPayment(payment, opts)` is called after a
`Payment` is confirmed `"Paid"`, at every place that happens in the existing codebase:

1. `payment.service.js` → `verifyRazorpayPayment`
2. `payment.service.js` → `createPayment` (manual/offline)
3. `payment.service.js` → `createAdminInvoice`
4. `payment.service.js` → `updatePaymentStatus` (also handles the refund direction)
5. `payment.service.js` → `verifyPaymentByAdmin`
6. `event.service.js` → delegation installment payments (both the first-installment and
   subsequent-installment code paths)

Every call is wrapped in try/catch and logged — a revenue-sharing failure never blocks the
payment flow the member/admin is actively completing. It's also idempotent: a unique
`{sourcePaymentId, beneficiaryLevel}` index on `RevenueLedgerEntry` means calling it twice
for the same payment (a retried request, a duplicate webhook-equivalent) safely no-ops on
the second call.

Refunds/revocations (`updatePaymentStatus(..., "Refunded")`,
`invoice.service.js` → `revokeInvoice`) call
`revenueShareService.reverseLedgerEntriesForPayment()`, which creates `RevenueAdjustment`
rows and flips unpaid ledger entries to `"reversed"`. An entry that was already `"paid"`
is instead flagged `requiresReview` on its adjustment — recovering money already sent out
needs a human decision, not a silent deduction.

## 6. Running the one-time setup

```bash
cd rifah-backend
node scripts/seed-revenue-share-rules.js
```

Creates the initial rule versions (membership 50/25/25, event 100% to organizer) if none
exist yet. Safe to re-run — only creates a rule when that revenue type has none at all.

### Optional: backfilling pre-existing payments

New ledger entries are created automatically for every payment going forward. Payments
made *before* this feature existed have no ledger entries. If you want historical revenue
reflected too, write a one-off script following the same shape as
`scripts/migrate-event-visibility.mjs` that iterates `Payment.find({status: "Paid"})` and
calls `createLedgerEntriesForPayment` for each — this is optional and was intentionally
left for Central Admin to run deliberately (not automatic), since it changes real
financial numbers at a moment of their choosing.

## 7. Running the tests

```bash
cd rifah-backend
node --test tests/revenue-sharing/allocation.test.js        # pure unit tests, no DB needed
node --test tests/revenue-sharing/claims-and-settlements.test.js   # needs a local Mongo
```

The second file needs a **replica-set-capable** local MongoDB (settlement recording uses a
multi-document transaction) at `mongodb://localhost:27018/rifah_qa` (or set
`QA_MONGODB_URI`), matching every other integration test in this repo
(`tests/auth/switch-role.test.js`). A plain standalone `mongod` does not support
transactions; either point `QA_MONGODB_URI` at MongoDB Atlas, or run locally with:

```bash
mongod --replSet rs0 --dbpath <some-local-dir> --port 27018
# in another shell, once:
mongosh --port 27018 --eval "rs.initiate()"
```
