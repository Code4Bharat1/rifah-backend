import mongoose from "mongoose";

// Refunds, chargebacks, and manual corrections against a RevenueLedgerEntry. Always a
// NEW row, never a mutation of the original entry — the original stays queryable exactly
// as it was calculated, satisfying "never delete or silently overwrite the original
// financial entry."
const revenueAdjustmentSchema = new mongoose.Schema(
  {
    ledgerEntryId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "RevenueLedgerEntry",
      required: true,
      index: true,
    },
    type: {
      type: String,
      enum: ["refund", "chargeback", "correction", "recovery"],
      required: true,
    },
    // Signed — negative reduces what's payable, positive is a correction adding back.
    amount: {
      type: Number,
      required: true,
    },
    reason: {
      type: String,
      required: true,
      trim: true,
    },
    // true when applying this adjustment would take an already-PAID entry negative —
    // i.e. money already sent out needs to be recovered. Flagged for manual review
    // instead of silently deducted from some unrelated future payment.
    requiresReview: {
      type: Boolean,
      default: false,
    },
    status: {
      type: String,
      enum: ["pending", "applied", "rejected"],
      default: "pending",
      index: true,
    },
    reviewedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    reviewedAt: {
      type: Date,
      default: null,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
  },
  { timestamps: true }
);

revenueAdjustmentSchema.index({ ledgerEntryId: 1, status: 1 });

export const RevenueAdjustment = mongoose.model("RevenueAdjustment", revenueAdjustmentSchema);
export default RevenueAdjustment;
