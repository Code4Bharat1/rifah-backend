import mongoose from "mongoose";

const VisaReferralSchema = new mongoose.Schema(
  {
    referenceNumber: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      index: true,
    },
    applicant: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      index: true,
      default: null,
    },
    applicantType: {
      type: String,
      enum: ["Member", "Business", "User", "Guest"],
      default: "Guest",
    },

    // ── 1. APPLICANT DETAILS ──────────────────────────────────────────
    fullName: {
      type: String,
      required: true,
      trim: true,
    },
    email: {
      type: String,
      trim: true,
      lowercase: true,
      default: "",
      index: true,
    },
    phone: {
      type: String,
      trim: true,
      default: "",
    },
    nationality: {
      type: String,
      default: "Indian",
      trim: true,
    },

    // ── 2. REQUIRED FIELDS FOR VISA REFERRAL ──────────────────────────
    destinationCountry: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    purposeOfVisit: {
      type: String,
      required: true,
      trim: true,
    },
    detailedDescriptionOfVisit: {
      type: String,
      required: true,
      trim: true,
    },

    // ── 3. FOUR MANDATORY SUPPORTING DOCUMENTS ────────────────────────
    aadharCardUrl: {
      type: String,
      required: true,
      trim: true,
    },
    panCardUrl: {
      type: String,
      required: true,
      trim: true,
    },
    passportDocUrl: {
      type: String,
      required: true,
      trim: true,
    },
    addressProofUrl: {
      type: String,
      required: true,
      trim: true,
    },

    // ── 4. PHYSICAL POSTAL DELIVERY ADDRESS (For hard copy dispatch by post) ─
    postalAddress: {
      recipientName: { type: String, trim: true, default: "" },
      addressLine1: { type: String, trim: true, default: "" },
      addressLine2: { type: String, trim: true, default: "" },
      city: { type: String, trim: true, default: "" },
      state: { type: String, trim: true, default: "" },
      pincode: { type: String, trim: true, default: "" },
      landmark: { type: String, trim: true, default: "" },
      contactPhone: { type: String, trim: true, default: "" },
    },

    // ── 5. APPLICATION FEE & INVOICE DETAILS (₹500 + 18% GST = ₹590 -> Central Account) ─
    fee: {
      type: Number,
      default: 500,
    },
    gstRate: {
      type: Number,
      default: 18,
    },
    gstAmount: {
      type: Number,
      default: 90,
    },
    totalAmount: {
      type: Number,
      default: 590,
    },
    feeCurrency: {
      type: String,
      default: "INR",
    },
    beneficiaryAccount: {
      type: String,
      default: "Central Account",
    },
    invoiceNumber: {
      type: String,
      default: "",
      index: true,
    },
    invoicePaymentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Payment",
      default: null,
    },
    paymentStatus: {
      type: String,
      enum: ["Pending", "Paid", "Failed"],
      default: "Paid",
      index: true,
    },
    paidAt: {
      type: Date,
      default: Date.now,
    },
    paymentMethod: {
      type: String,
      default: "Online (Central Account)",
    },

    // ── 6. WORKFLOW & STATUS (Exclusively Managed by Central Admin) ───
    status: {
      type: String,
      enum: ["Pending", "In Progress", "Approved", "Delivered", "Rejected"],
      default: "Pending",
      index: true,
    },
    adminNotes: {
      type: String,
      trim: true,
      default: "",
    },
    rejectionReason: {
      type: String,
      trim: true,
      default: "",
    },

    // Official Issued Referral Letter Reference
    referralLetter: {
      letterNumber: { type: String, trim: true, default: "" },
      issuedDate: { type: Date },
      signerName: { type: String, trim: true, default: "Central Secretariat" },
      signerTitle: { type: String, trim: true, default: "Authorized Signatory, RIFAH Chamber of Commerce" },
    },

    // Physical Postal Dispatch Details (Recorded upon physical delivery by post/courier)
    postalDispatch: {
      courierProvider: { type: String, trim: true, default: "" }, // e.g. "India Post (Speed Post)", "Blue Dart", "DTDC"
      consignmentNumber: { type: String, trim: true, default: "" },
      dispatchedDate: { type: Date },
      postalNotes: { type: String, trim: true, default: "" },
    },

    deliveredAt: {
      type: Date,
    },
    deliveredBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },

    // ── 7. AUDIT TRAIL ───────────────────────────────────────────────
    timeline: [
      {
        status: { type: String, required: true },
        timestamp: { type: Date, default: Date.now },
        note: { type: String, default: "" },
        changedBy: { type: String, default: "System" },
      },
    ],

    // ── 8. OPTIONAL COMPATIBILITY FIELDS ─────────────────────────────
    passportNumber: { type: String, trim: true, default: "" },
    passportExpiryDate: { type: Date },
    companyName: { type: String, trim: true, default: "" },
    designation: { type: String, trim: true, default: "" },
    visaCategory: { type: String, trim: true, default: "Business Visa" },
    embassyCity: { type: String, trim: true, default: "Mumbai" },
    travelDepartureDate: { type: Date },
    travelReturnDate: { type: Date },
    durationDays: { type: Number, default: 0 },
    isRifahMember: { type: Boolean, default: false },
    membershipId: { type: String, trim: true, default: "" },
    chapter: { type: String, trim: true, default: "" },
    passportFrontUrl: { type: String, trim: true, default: "" },
    passportBackUrl: { type: String, trim: true, default: "" },
    invitationLetterUrl: { type: String, trim: true, default: "" },
    businessProofUrl: { type: String, trim: true, default: "" },
  },
  {
    timestamps: true,
  }
);

export const VisaReferral = mongoose.model("VisaReferral", VisaReferralSchema);
export default VisaReferral;
