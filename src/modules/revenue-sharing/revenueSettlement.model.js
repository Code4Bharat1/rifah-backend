import mongoose from "mongoose";

// Actual money movement against an approved RevenueClaim. A claim can have multiple
// settlements (partial payments); the sum of its settlements is what actually reduces
// outstanding balance — never the claim or its approval by themselves.
const revenueSettlementSchema = new mongoose.Schema(
  {
    claimId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "RevenueClaim",
      required: true,
      index: true,
    },
    amount: {
      type: Number,
      required: true,
      min: 0.01,
    },
    method: {
      type: String,
      default: "Bank Transfer",
    },
    referenceNumber: {
      type: String,
      default: "",
    },
    // Required, unique — a retried "record settlement" request with the same key is a
    // no-op that returns the original settlement instead of creating a second one.
    idempotencyKey: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    notes: {
      type: String,
      default: "",
    },
    paidBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    paidAt: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: true }
);

export const RevenueSettlement = mongoose.model("RevenueSettlement", revenueSettlementSchema);
export default RevenueSettlement;
