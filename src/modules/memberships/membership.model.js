import mongoose from "mongoose";
import { ENUMS } from "../../shared/constants/enums.js";
import { STATUSES } from "../../shared/constants/statuses.js";

const membershipSchema = new mongoose.Schema(
  {
    business: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Business",
      required: true,
      index: true,
    },
    planId: {
      type: String,
      default: "free",
      index: true,
    },
    planName: {
      type: String,
      default: "Free",
    },
    price: {
      type: Number,
      default: 0,
    },
    billingCycle: {
      type: String,
      enum: ["Monthly", "Annual", "Lifetime"],
      default: "Annual",
    },
    startDate: {
      type: Date,
      default: Date.now,
    },
    endDate: {
      type: Date,
    },
    status: {
      type: String,
      enum: Object.values(STATUSES.MEMBERSHIP),
      default: STATUSES.MEMBERSHIP.ACTIVE,
      index: true,
    },
    features: [
      {
        type: String,
      },
    ],
  },
  {
    timestamps: true,
  }
);

export const Membership = mongoose.model("Membership", membershipSchema);
export default Membership;
