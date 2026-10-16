import mongoose from "mongoose";

const dignitarySchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "Dignitary name is required"],
      trim: true,
    },
    category: {
      type: String,
      default: "", // e.g. "Government Official", "Foreign Delegation", or custom
      trim: true,
    },
    mobile: {
      type: String,
      default: "",
      trim: true,
    },
    email: {
      type: String,
      default: "",
      trim: true,
      lowercase: true,
    },
    org: {
      type: String,
      default: "",
      trim: true,
    },
    designation: {
      type: String,
      default: "",
      trim: true,
    },
    type: {
      type: String,
      default: "Guest Speaker", // "Guest Speaker", "Keynote Speaker", "Hero of Event", "Chief Guest", "Dignitary"
      trim: true,
    },
    topic: {
      type: String,
      default: "",
      trim: true,
    },
    photo: {
      type: String,
      default: "",
    },
    status: {
      type: String,
      default: "Confirmed",
      trim: true,
    },
    notes: {
      type: String,
      default: "",
    },
    city: {
      type: String,
      default: "",
      trim: true,
    },
    state: {
      type: String,
      default: "",
      trim: true,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
  },
  {
    timestamps: true,
  }
);

dignitarySchema.index({ name: 1, mobile: 1 });
dignitarySchema.index({ category: 1 });

export const Dignitary = mongoose.model("Dignitary", dignitarySchema);
