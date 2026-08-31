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
  },
  {
    timestamps: true,
  }
);

export const Audit = mongoose.model("Audit", auditSchema);
export default Audit;
