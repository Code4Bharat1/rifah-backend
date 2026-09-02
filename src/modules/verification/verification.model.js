import mongoose from "mongoose";
import { STATUSES } from "../../shared/constants/statuses.js";

const documentSchema = new mongoose.Schema({
  type: {
    type: String,
    enum: [
      "Udyam Registration",
      "msme_udyam",
      "GST Certificate",
      "gst_certificate",
      "FSSAI License",
      "fssai_license",
      "PAN Card",
      "pan_card",
      "Company Incorporation",
      "trade_license",
      "Other",
    ],
    required: true,
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
    enum: ["pending", "under_review", "approved", "rejected"],
    default: "pending",
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
