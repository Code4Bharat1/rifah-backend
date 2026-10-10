import mongoose from "mongoose";

// Configurable, versioned, effective-dated revenue-share rules.
//
// "membership" rules split a membership payment's eligible base three ways at once
// (chapter / state / central), all computed from the SAME base — not cascaded through
// each other. "event" rules currently give 100% to whichever org level organized the
// event ("organizer", resolved per-event from Event.visibilityScope at allocation time,
// not stored here), but are modeled the same configurable way so a future change (e.g.
// Central retaining a cut of event revenue) doesn't need new code, just a new rule
// version.
const allocationSchema = new mongoose.Schema(
  {
    beneficiaryLevel: {
      type: String,
      enum: ["chapter", "state", "central", "organizer"],
      required: true,
    },
    percentage: {
      type: Number,
      required: true,
      min: 0,
      max: 100,
    },
  },
  { _id: false }
);

const revenueShareRuleSchema = new mongoose.Schema(
  {
    revenueType: {
      type: String,
      enum: ["membership", "event"],
      required: true,
      index: true,
    },
    allocations: {
      type: [allocationSchema],
      required: true,
      validate: {
        validator: (arr) => Array.isArray(arr) && arr.length > 0,
        message: "A revenue share rule must have at least one allocation",
      },
    },
    version: {
      type: Number,
      required: true,
    },
    effectiveFrom: {
      type: Date,
      required: true,
      default: Date.now,
    },
    // null = still active / open-ended
    effectiveTo: {
      type: Date,
      default: null,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    notes: {
      type: String,
      default: "",
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
  },
  { timestamps: true }
);

revenueShareRuleSchema.index({ revenueType: 1, effectiveFrom: -1 });
revenueShareRuleSchema.index({ revenueType: 1, version: -1 }, { unique: true });

export const RevenueShareRule = mongoose.model("RevenueShareRule", revenueShareRuleSchema);
export default RevenueShareRule;
