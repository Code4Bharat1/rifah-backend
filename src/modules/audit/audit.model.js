import mongoose from "mongoose";
import { ENUMS } from "../../shared/constants/enums.js";

const auditSchema = new mongoose.Schema(
  {
    actor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    actorName: {
      type: String,
      required: true,
    },
    actorRole: {
      type: String,
      required: true,
    },
    action: {
      type: String,
      enum: ENUMS.AUDIT_ACTIONS,
      required: true,
      index: true,
    },
    targetModel: {
      type: String,
      required: true,
    },
    targetId: {
      type: String,
      required: true,
    },
    summary: {
      type: String,
      required: true,
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    ipAddress: {
      type: String,
      default: "",
    },
    userAgent: {
      type: String,
      default: "",
    },
    device: {
      type: String,
      default: "",
    },
    macAddress: {
      type: String,
      default: "",
    },
  },
  {
    timestamps: true,
  }
);

// This is a high-write collection (one row per admin action); pulling one entity's
// history (targetModel+targetId) or the recent log view (createdAt) previously had no
// supporting index at all.
auditSchema.index({ targetModel: 1, targetId: 1, createdAt: -1 });
auditSchema.index({ createdAt: -1 });

export const Audit = mongoose.model("Audit", auditSchema);
export default Audit;
