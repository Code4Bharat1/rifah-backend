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
      default: "+91 22 2345 6789",
    },
    secretariatAddress: {
      type: String,
      default: "Central Admin Office, Byculla, Mumbai 400 008",
    },
    workingHours: {
      type: String,
      default: "Mon–Fri · 09:30–18:00 IST",
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
    // Tier 4 Shared GST Group member cap. Default 5 matches what the Tier IV plan
    // already advertises ("5 Team member seats" in DEFAULT_MEMBERSHIP_PLANS) — this
    // just makes that number real and admin-adjustable instead of only decorative text.
    maxGstGroupMembers: {
      type: Number,
      default: 5,
    },
    certificateSettings: {
      type: mongoose.Schema.Types.Mixed,
      default: () => ({
        signatory1: {
          name: "S AMEENUL HASAN",
          title: "(Chairman)",
          signatureUrl: "",
        },
        signatory2: {
          name: "MIRZA AFZAL BAIG",
          title: "(General Secretary)",
          signatureUrl: "",
        },
        admissionText:
          "Has been duly admitted as a Member of the Rifah Chamber of Commerce and Industry. The authorized representative of the organization, as stated in the membership application, is:",
        registeredOffice:
          "Flat No. 4 C & D, 1st Floor, Plot No. 96, 77C, Hamid Building, Mominpura, Jacob Circle, Byculla West, Mumbai – 400011, Maharashtra",
        contactPhone: "+91-8097781851",
        contactEmail: "office@rifah.org",
        website: "www.rifah.org",
        tiers: {
          silver: {
            badgeName: "SILVER",
            accentColor: "#c01e1e",
            templateUrl: "/certificate-silver.jpg",
          },
          gold: {
            badgeName: "GOLD",
            accentColor: "#8b1d1d",
            templateUrl: "/certificate-gold.jpg",
          },
          platinum: {
            badgeName: "PLATINUM",
            accentColor: "#102a45",
            templateUrl: "/certificate-platinum.jpg",
          },
          diamond: {
            badgeName: "DIAMOND",
            accentColor: "#004b87",
            templateUrl: "/certificate-diamond.png",
          },
        },
      }),
    },
  },
  { timestamps: true }
);

export const Settings = mongoose.model("Settings", settingsSchema);
