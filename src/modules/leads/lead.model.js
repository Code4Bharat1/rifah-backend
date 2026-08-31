import mongoose from "mongoose";
import { STATUSES } from "../../shared/constants/statuses.js";

const leadSchema = new mongoose.Schema(
  {
    enquiry: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Enquiry",
      required: true,
      index: true,
    },
    business: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Business",
      required: true,
      index: true,
    },
    status: {
      type: String,
      enum: Object.values(STATUSES.LEAD),
      default: STATUSES.LEAD.NEW,
      index: true,
    },
    quotation: {
      amount: String,
      deliveryTime: String,
      terms: String,
      submittedAt: Date,
    },
    notes: {
      type: String,
      default: "",
    },
    lastActivityAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
  }
);

leadSchema.index({ enquiry: 1, business: 1 }, { unique: true });

export const Lead = mongoose.model("Lead", leadSchema);
export default Lead;
