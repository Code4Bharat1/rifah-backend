import mongoose from "mongoose";

const planSchema = new mongoose.Schema(
  {
    planId: {
      type: String,
      required: true,
      unique: true,
      index: true,
      trim: true,
      lowercase: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    price: {
      type: Number,
      required: true,
      default: 0,
    },
    summary: {
      type: String,
      trim: true,
      default: "",
    },
    features: [
      {
        type: String,
        trim: true,
      },
    ],
  },
  { timestamps: true }
);

export const Plan = mongoose.model("Plan", planSchema);
