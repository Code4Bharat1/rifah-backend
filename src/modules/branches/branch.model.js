import mongoose from "mongoose";

const branchSchema = new mongoose.Schema(
  {
    business: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Business",
      required: [true, "Business is required"],
      index: true,
    },
    owner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: [true, "Owner is required"],
      index: true,
    },
    name: {
      type: String,
      required: [true, "Branch name is required"],
      trim: true,
    },
    branchType: {
      type: String,
      enum: [
        "Head Office",
        "Regional Office",
        "Retail Store",
        "Warehouse",
        "Service Center",
        "Franchise",
        "Corporate Office",
        "Branch Office",
        "Other",
      ],
      default: "Branch Office",
    },
    image: {
      type: String,
      default: "",
    },
    contactPerson: {
      type: String,
      trim: true,
      default: "",
    },
    phone: {
      type: String,
      trim: true,
      default: "",
    },
    email: {
      type: String,
      trim: true,
      lowercase: true,
      default: "",
    },
    address: {
      type: String,
      trim: true,
      default: "",
    },
    city: {
      type: String,
      required: [true, "City is required"],
      trim: true,
      index: true,
    },
    state: {
      type: String,
      trim: true,
      default: "",
    },
    country: {
      type: String,
      trim: true,
      default: "India",
    },
    pincode: {
      type: String,
      trim: true,
      default: "",
    },
    mapUrl: {
      type: String,
      trim: true,
      default: "",
    },
    timings: {
      type: String,
      trim: true,
      default: "Mon - Sat: 9:00 AM - 7:00 PM",
    },
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
    displayOrder: {
      type: Number,
      default: 0,
    },
  },
  {
    timestamps: true,
  }
);

branchSchema.index({ business: 1, isActive: 1 });

export const Branch = mongoose.model("Branch", branchSchema);
