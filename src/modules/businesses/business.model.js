import mongoose from "mongoose";
import { ENUMS } from "../../shared/constants/enums.js";
import { STATUSES } from "../../shared/constants/statuses.js";

const businessSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "Business name is required"],
      trim: true,
      index: true,
    },
    slug: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      index: true,
    },
    tagline: {
      type: String,
      trim: true,
      default: "",
    },
    about: {
      type: String,
      default: "",
    },
    industry: {
      type: String,
      required: [true, "Industry is required"],
      trim: true,
      index: true,
    },
    categories: [
      {
        type: String,
        trim: true,
      },
    ],
    businessType: {
      type: String,
      enum: ENUMS.BUSINESS_TYPES,
      default: "Proprietorship",
    },
    city: {
      type: String,
      required: [true, "City is required"],
      trim: true,
      index: true,
    },
    state: {
      type: String,
      required: [true, "State is required"],
      trim: true,
    },
    address: {
      type: String,
      default: "",
    },
    chapter: {
      type: String,
      required: true,
      default: "Mumbai Chapter",
      index: true,
    },
    membership: {
      type: String,
      enum: ENUMS.MEMBERSHIP_TIERS,
      default: "Free",
      index: true,
    },
    verification: {
      type: String,
      enum: Object.values(STATUSES.VERIFICATION),
      default: STATUSES.VERIFICATION.UNVERIFIED,
      index: true,
    },
    rating: {
      type: Number,
      default: 0,
      min: 0,
      max: 5,
    },
    reviewsCount: {
      type: Number,
      default: 0,
    },
    employees: {
      type: String,
      default: "10–50",
    },
    founded: {
      type: String,
      default: "",
    },
    website: {
      type: String,
      default: "",
    },
    phone: {
      type: String,
      default: "",
    },
    email: {
      type: String,
      lowercase: true,
      trim: true,
      default: "",
    },
    hours: {
      type: String,
      default: "Mon–Sat · 09:30–18:30",
    },
    featured: {
      type: Boolean,
      default: false,
      index: true,
    },
    accent: {
      type: String,
      default: "from-primary/90 to-primary/40",
    },
    logo: {
      type: String,
      default: "",
    },
    coverImage: {
      type: String,
      default: "",
    },
    gallery: [
      {
        type: String,
      },
    ],
    productsSummary: [
      {
        type: String,
      },
    ],
    servicesSummary: [
      {
        type: String,
      },
    ],
    certifications: [
      {
        type: String,
      },
    ],
    status: {
      type: String,
      enum: ["Active", "Suspended", "Draft"],
      default: "Active",
      index: true,
    },
    owner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

businessSchema.index({ name: "text", about: "text", tagline: "text", productsSummary: "text" });

export const Business = mongoose.model("Business", businessSchema);
export default Business;
