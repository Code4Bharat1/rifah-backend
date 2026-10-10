import mongoose from "mongoose";

// A Chapter or State's claim against its outstanding balance payable by Center.
// Submitting/approving a claim never itself changes the outstanding balance — only a
// RevenueSettlement recorded against an approved claim does (see revenueClaim.service.js).
const attachmentSchema = new mongoose.Schema(
  {
    url: { type: String, required: true },
    name: { type: String, default: "" },
    uploadedAt: { type: Date, default: Date.now },
  },
  { _id: false },
);

const revenueClaimSchema = new mongoose.Schema(
  {
    claimNumber: {
      type: String,
      required: true,
      unique: true,
      index: true, // e.g. CLM-00042
    },
    beneficiaryLevel: {
      type: String,
      enum: ["chapter", "state"],
      required: true,
    },
    chapterId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Chapter",
      default: null,
      index: true,
    },
    state: {
      type: String,
      default: "",
      index: true,
    },
    revenueType: {
      type: String,
      enum: ["membership", "event"],
      default: "membership",
      index: true,
    },
    payingOrgLevel: {
      type: String,
      enum: ["central", "state"],
      default: "central",
    },
    claimedAmount: {
      type: Number,
      required: true,
      min: 0.01,
    },
    // Either a period range or an explicit set of ledger entries — at least one must be
    // given so the claim is traceable to real transactions, not just a bare number.
    periodFrom: { type: String, default: "" }, // "YYYY-MM"
    periodTo: { type: String, default: "" },
    ledgerEntryIds: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "RevenueLedgerEntry",
      },
    ],
    status: {
      type: String,
      enum: [
        "draft",
        "submitted",
        "under_review",
        "approved",
        "rejected",
        "partially_paid",
        "paid",
        "cancelled",
      ],
      default: "draft",
      index: true,
    },
    notes: { type: String, default: "" },
    attachments: { type: [attachmentSchema], default: [] },

    submittedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    submittedAt: { type: Date, default: null },
    reviewedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    reviewedAt: { type: Date, default: null },
    approvedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    approvedAt: { type: Date, default: null },
    rejectedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    rejectedAt: { type: Date, default: null },
    rejectionReason: { type: String, default: "" },
    cancelledBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    cancelledAt: { type: Date, default: null },

    // Explicit, logged override for the rare case a claim must exceed the
    // mechanically-computed eligible outstanding balance (spec's "except through an
    // explicitly authorized adjustment workflow") — Central Admin only, never silent.
    overrideApproved: { type: Boolean, default: false },
    overrideReason: { type: String, default: "" },
    overrideBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },

    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
  },
  { timestamps: true },
);

revenueClaimSchema.index({ beneficiaryLevel: 1, chapterId: 1, status: 1 });
revenueClaimSchema.index({ beneficiaryLevel: 1, state: 1, status: 1 });

export const RevenueClaim = mongoose.model("RevenueClaim", revenueClaimSchema);
export default RevenueClaim;
