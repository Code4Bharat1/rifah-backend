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
    priceUsd: {
      type: Number,
      default: 0,
    },
    durationYears: {
      type: Number,
      default: 1,
    },
    gstRate: {
      type: Number,
      default: 18,
    },
    displayOrder: {
      type: Number,
      default: 0,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    isRecommended: {
      type: Boolean,
      default: false,
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
    missingFeatures: [
      {
        type: String,
        trim: true,
      },
    ],
  },
  { timestamps: true }
);

export const Plan = mongoose.model("Plan", planSchema);
