import mongoose from "mongoose";

// The auditable, line-item revenue-sharing ledger. One document per beneficiary
// allocation — a single ₹1,00,000 membership payment produces THREE of these rows
// (chapter/state/central), each independently traceable back to the source payment,
// the rule+version used, and (once claimed/settled) the claim and settlement records.
//
// Deliberately transaction-level, not a mutable running-total row: outstanding balances
// are always computed by summing these (+ RevenueAdjustment, + RevenueSettlement), never
// stored and hand-edited.
const revenueLedgerEntrySchema = new mongoose.Schema(
  {
    sourcePaymentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Payment",
      required: true,
      index: true,
    },
    // Membership or Event id this allocation is derived from.
    sourceReference: {
      type: {
        type: String,
        enum: ["membership", "event"],
        required: true,
      },
      refId: {
        type: mongoose.Schema.Types.ObjectId,
        default: null,
      },
    },
    revenueType: {
      type: String,
      enum: ["membership", "event"],
      required: true,
      index: true,
    },
    payerUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    businessId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Business",
      default: null,
      index: true,
    },
    // Event-revenue entries only.
    eventId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Event",
      default: null,
      index: true,
    },
    eventOrganizerLevel: {
      type: String,
      enum: ["chapter", "state", "global", null],
      default: null,
    },
    // Snapshotted association — resolved and frozen at ledger-entry creation time, so a
    // later change to the member's/business's chapter or state assignment never silently
    // alters a historical allocation. chapterId is a real ref (Chapter has a real _id);
    // state has no formal model in this codebase (free-text everywhere), so it's stored
    // and matched as a normalized string, same convention as Chapter/Business/Payment.
    chapterId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Chapter",
      default: null,
      index: true,
    },
    // Named `chapter` (not `chapterName`) deliberately — chapter-scope.js's
    // getChapterFilter(user, "direct_id") regex-matches a field literally named
    // `chapter` on the target model; matching that name lets this ledger reuse that
    // existing permission utility completely unmodified.
    chapter: {
      type: String,
      default: "",
    },
    state: {
      type: String,
      default: "",
      index: true,
    },
    // Money. All rupee decimals (2dp) — see revenueShare.service.js for rounding policy.
    grossAmount: { type: Number, required: true },
    discount: { type: Number, default: 0 },
    gstAmount: { type: Number, default: 0 },
    refundAmount: { type: Number, default: 0 },
    // The base shares were actually calculated from (gross - discount - gst, net of any
    // refund applied before this entry was created). Never recomputed after the fact —
    // corrections go through RevenueAdjustment.
    eligibleBase: { type: Number, required: true },

    ruleId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "RevenueShareRule",
      required: true,
    },
    ruleVersion: { type: Number, required: true },

    beneficiaryLevel: {
      type: String,
      enum: ["chapter", "state", "central"],
      required: true,
      index: true,
    },
    percentage: { type: Number, required: true },
    calculationBasis: { type: String, default: "subtotal" },
    allocatedAmount: { type: Number, required: true },
    // Cumulative amount actually settled against this entry so far (can be built up
    // across multiple partial settlements). status is derived from this vs
    // allocatedAmount each time a settlement is recorded — see revenueClaim.service.js.
    paidAmount: { type: Number, default: 0 },

    // Center collects every payment in this system, so the paying org is always Central.
    payingOrgLevel: { type: String, default: "central" },

    currency: { type: String, default: "INR" },

    // "YYYY-MM", derived from transactionDate — the accounting period this entry belongs
    // to for carry-forward/period-close reporting.
    accountingPeriod: { type: String, required: true, index: true },
    transactionDate: { type: Date, required: true },

    // central's own beneficiaryLevel="central" rows are created directly as "paid"
    // (Center owing itself is not a liability) — see revenueShare.service.js. Every
    // outstanding-balance query therefore excludes them by construction, not as a
    // special case written into each query.
    status: {
      type: String,
      enum: ["pending", "payable", "partially_paid", "paid", "reversed", "disputed"],
      default: "payable",
      index: true,
    },

    claimId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "RevenueClaim",
      default: null,
      index: true,
    },
    settlementIds: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "RevenueSettlement",
      },
    ],

    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null, // null = system-generated from a payment event
    },
  },
  { timestamps: true }
);

revenueLedgerEntrySchema.index({ chapterId: 1, status: 1 });
revenueLedgerEntrySchema.index({ state: 1, status: 1 });
revenueLedgerEntrySchema.index({ sourcePaymentId: 1, beneficiaryLevel: 1 }, { unique: true });

export const RevenueLedgerEntry = mongoose.model("RevenueLedgerEntry", revenueLedgerEntrySchema);
export default RevenueLedgerEntry;
