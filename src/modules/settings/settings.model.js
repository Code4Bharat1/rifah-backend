import mongoose from "mongoose";

const settingsSchema = new mongoose.Schema(
  {
    isSingleton: {
      type: String,
      default: "global",
      unique: true,
    },
    manualVerificationRequired: {
      type: Boolean,
      default: true,
    },
    moderateReviewsBeforePublishing: {
      type: Boolean,
      default: true,
    },
    allowPublicEnquiryPosting: {
      type: Boolean,
      default: false,
    },
    autoRouteLeadsByCategory: {
      type: Boolean,
      default: true,
    },
    organisationName: {
      type: String,
      default: "RIFAH Chamber of Commerce & Industries",
    },
    secretariatEmail: {
      type: String,
      default: "secretariat@example.org",
    },
    supportPhone: {
      type: String,
      default: "+00 0000 000000",
    },
    membershipYear: {
      type: String,
      default: "2026-27",
    },
    registrationFee: {
      type: Number,
      default: 1000,
    },
    defaultMembershipFee: {
      type: Number,
      default: 5000,
    },
    leadLimitPerMonth: {
      type: Number,
      default: 100,
    },
    maxCatalogueItems: {
      type: Number,
      default: 50,
    },
    maxImagesPerItem: {
      type: Number,
      default: 5,
    },
  },
  { timestamps: true }
);

export const Settings = mongoose.model("Settings", settingsSchema);
