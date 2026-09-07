import mongoose from "mongoose";
import { STATUSES } from "../../shared/constants/statuses.js";

const documentSchema = new mongoose.Schema({
  type: {
    type: String,
    required: true,
    trim: true,
  },
  name: {
    type: String,
    trim: true,
    default: "",
  },
  number: {
    type: String,
    trim: true,
    default: "",
  },
  fileUrl: {
    type: String,
    required: true,
  },
  status: {
    type: String,
    enum: ["pending", "under_review", "approved", "verified", "rejected", "missing"],
    default: "pending",
  },
  uploadedAt: {
    type: Date,
    default: Date.now,
  },
});

const verificationSchema = new mongoose.Schema(
  {
    business: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Business",
      required: true,
      index: true,
    },
    submittedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    documents: [documentSchema],
    status: {
      type: String,
      enum: Object.values(STATUSES.VERIFICATION),
      default: STATUSES.VERIFICATION.PENDING,
      index: true,
    },
    remarks: {
      type: String,
      default: "",
    },
    reviewedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    reviewedAt: {
      type: Date,
    },
  },
  {
    timestamps: true,
  }
);

export const Verification = mongoose.model("Verification", verificationSchema);
export default Verification;
