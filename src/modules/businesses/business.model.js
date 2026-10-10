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
      trim: true,
      default: "",
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
      trim: true,
      default: "",
      index: true,
    },
    state: {
      type: String,
      trim: true,
      default: "",
    },
    address: {
      type: String,
      default: "",
    },
    pincode: {
      type: String,
      trim: true,
      default: "",
    },
    chapter: {
      type: String,
      trim: true,
      default: "",
      index: true,
    },
    chapterId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Chapter",
      default: null,
      index: true,
    },
    region: {
      type: String,
      enum: ["national", "international"],
      default: "national",
      index: true,
    },
    currency: {
      type: String,
      enum: ["INR", "USD"],
      default: "INR",
    },
    dob: {
      type: Date,
      default: null,
      index: true,
    },
    timezone: {
      type: String,
      trim: true,
      default: "Asia/Kolkata",
    },
    membership: {
      type: String,
      default: "Free",
      index: true,
    },
    // BUG-065: membershipService.upgradePlan has always tried to write
    // `business.subscriberTier = planKey` (e.g. "tier_2") after every plan purchase, but
    // this field never existed on the schema, so Mongoose silently dropped it on every
    // single save — only the display-name `membership` field above ever actually
    // persisted. Adding it here is the fix; the write-side code in upgradePlan is
    // unchanged (it was already correct, just writing into the void).
    subscriberTier: {
      type: String,
      default: "",
      index: true,
    },
    membershipId: {
      type: String,
      trim: true,
      index: true,
    },
    lastActionDate: {
      type: Date,
      default: Date.now,
      index: true,
    },
    paymentStatus: {
      type: String,
      enum: ["Pending", "Paid", "Failed", "Refunded", "Free", "pending", "paid", "failed", "refunded", "free"],
      default: "Pending",
      index: true,
    },
    isPaid: {
      type: Boolean,
      default: false,
      index: true,
    },
    verification: {
      type: String,
      enum: [
        "unverified", "pending", "under_review", "correction_requested", "verified", "rejected",
        "Unverified", "Pending", "Under Review", "Correction Requested", "Verified", "Rejected"
      ],
      default: "unverified",
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
    views: {
      type: Number,
      default: 0,
      min: 0,
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
    instagram: {
      type: String,
      trim: true,
      default: "",
    },
    linkedin: {
      type: String,
      trim: true,
      default: "",
    },
    taxId: {
      type: String,
      trim: true,
      default: "",
    },
    // Tier 4 Shared GST Group. A business's own GSTIN — distinct from `taxId` above,
    // which is a generic free-text field already used for ad-hoc tax IDs elsewhere.
    gstin: {
      type: String,
      trim: true,
      uppercase: true,
      default: "",
      index: true,
    },
    // true only when associateGstin found this GSTIN already claimed by a DIFFERENT
    // business — flagged for Central Admin resolution rather than silently allowed or
    // silently blocked forever. See gst-group.service.js associateGstin.
    gstinDisputed: {
      type: Boolean,
      default: false,
    },
    // Modeled directly on Event.roleAssignments (event.model.js) — same shape, same
    // reasoning: a sub-document array of real users linked to this parent record, each
    // with a role. "owner" is implicitly the Business.owner the first time the group is
    // used (lazily seeded, not duplicated here) plus anyone explicitly promoted.
    // Removed members are never deleted from this array (status flips to "removed")
    // so the history/audit trail survives a removal.
    gstGroupMembers: [
      {
        user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
        role: { type: String, enum: ["owner", "member"], default: "member" },
        status: { type: String, enum: ["invited", "active", "removed"], default: "active" },
        invitedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
        invitedAt: { type: Date, default: Date.now },
        joinedAt: { type: Date, default: null },
        removedAt: { type: Date, default: null },
        removedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
      },
    ],
    // Pending invitations by email (the invitee may not have a User account yet) —
    // accepted via POST /businesses/gst-group/accept/:token, which then adds a row to
    // gstGroupMembers above and marks the invite "accepted".
    gstGroupInvites: [
      {
        token: { type: String, required: true },
        email: { type: String, required: true, lowercase: true, trim: true },
        role: { type: String, enum: ["owner", "member"], default: "member" },
        invitedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
        invitedAt: { type: Date, default: Date.now },
        expiresAt: { type: Date, required: true },
        status: { type: String, enum: ["pending", "accepted", "expired", "revoked"], default: "pending" },
      },
    ],
    phone: {
      type: String,
      default: "",
    },
    whatsapp: {
      type: String,
      trim: true,
      default: "",
    },
    whatsappNumber: {
      type: String,
      trim: true,
      default: "",
    },
    contactPerson: {
      type: String,
      trim: true,
      default: "",
    },
    roleInBusiness: {
      type: String,
      trim: true,
      default: "Founder / Owner",
    },
    designation: {
      type: String,
      trim: true,
      default: "Founder / Owner",
    },
    contactPersonRole: {
      type: String,
      trim: true,
      default: "Founder / Owner",
    },
    email: {
      type: String,
      lowercase: true,
      trim: true,
      default: "",
    },
    ownerEmail: {
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
    dob: {
      type: Date,
      default: null,
      index: true,
    },
    joiningDate: {
      type: Date,
      default: Date.now,
      index: true,
    },
    timezone: {
      type: String,
      default: "Asia/Kolkata",
    },
    lastBirthdayWishYear: {
      type: Number,
      default: 0,
    },
    lastAnniversaryWishYear: {
      type: Number,
      default: 0,
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
    testimonials: [
      {
        userName: {
          type: String,
          trim: true,
          default: "",
        },
        businessName: {
          type: String,
          trim: true,
          default: "",
        },
        photo: {
          type: String,
          default: "",
        },
        testimonial: {
          type: String,
          trim: true,
          default: "",
        },
        rating: {
          type: Number,
          default: 5,
          min: 1,
          max: 5,
        },
        isHidden: {
          type: Boolean,
          default: false,
        },
        createdAt: {
          type: Date,
          default: Date.now,
        },
      },
    ],
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
    status: {
      type: String,
      enum: [
        "Active", "Suspended", "Draft", "Pending Verification", "Live", "Pending",
        "active", "suspended", "draft", "pending", "pending_verification"
      ],
      default: "Active",
      index: true,
    },
    verificationReviewReason: {
      type: String,
      default: "",
    },
    verificationRemarks: {
      type: String,
      default: "",
    },
    verificationHistory: [
      {
        action: { type: String },
        reason: { type: String },
        reviewer: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
        createdAt: { type: Date, default: Date.now },
      },
    ],
    adminRemark: {
      type: String,
      default: "",
    },
    adminUpdateAcknowledged: {
      type: Boolean,
      default: true,
    },
    adminUpdateChanges: {
      type: String,
      default: "",
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
// Scaled for 10k users: indexes for email lookup on login/switch and directory filtering
businessSchema.index({ ownerEmail: 1 });
businessSchema.index({ email: 1 });
businessSchema.index({ chapter: 1, status: 1 });
businessSchema.index({ state: 1, status: 1 });
businessSchema.index({ "gstGroupInvites.token": 1 });
businessSchema.index({ "gstGroupMembers.user": 1 });

businessSchema.pre("save", function (next) {
  if (!this.membershipId && this._id) {
    this.membershipId = `RIFAH-MEM-${this._id.toString().slice(-6).toUpperCase()}`;
  }
  if (!this.lastActionDate) {
    this.lastActionDate = this.updatedAt || new Date();
  }
  if (typeof next === "function") next();
});

export const Business = mongoose.model("Business", businessSchema);
export default Business;
