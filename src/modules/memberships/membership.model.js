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
    subscriberTier: {
      type: String,
      default: "tier_1",
      index: true,
    },
    price: {
      type: Number,
      default: 0,
    },
    billingCycle: {
      type: String,
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
    remindersSent: [
      {
        milestone: {
          type: String,
          required: true,
        },
        sentAt: {
          type: Date,
          default: Date.now,
        },
        forEndDate: {
          type: Date,
        },
      },
    ],
  },
  {
    timestamps: true,
  }
);

// `endDate` backs the hourly membership-expiry scheduler's full-collection scan
// (membership.service.js) and `{business,status}` backs the common "is this business's
// membership active" lookup — neither had an index before.
membershipSchema.index({ endDate: 1 });
membershipSchema.index({ business: 1, status: 1 });

export const Membership = mongoose.model("Membership", membershipSchema);
export default Membership;
