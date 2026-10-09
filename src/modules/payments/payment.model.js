import mongoose from "mongoose";
import { ENUMS } from "../../shared/constants/enums.js";
import { STATUSES } from "../../shared/constants/statuses.js";

const paymentSchema = new mongoose.Schema(
  {
    invoiceNumber: {
      type: String,
      required: true,
      unique: true,
      index: true, // e.g. INV-8821
    },
    payer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    business: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Business",
      index: true,
    },
    eventId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Event",
      index: true,
    },
    courseId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Course",
      index: true,
    },
    itemType: {
      type: String,
      default: "Membership",
      index: true,
    },
    planTier: {
      type: String,
      default: "",
    },
    chapter: {
      type: String,
      default: "",
      index: true,
    },
    state: {
      type: String,
      default: "",
      index: true,
    },
    collectingChapter: {
      type: String,
      default: "",
    },
    collectingState: {
      type: String,
      default: "",
    },
    durationYears: {
      type: Number,
      default: 1,
    },
    description: {
      type: String,
      default: "Membership Subscription",
    },
    subtotal: {
      type: Number,
      default: 0,
    },
    gstRate: {
      type: Number,
      default: 18,
    },
    gstAmount: {
      type: Number,
      default: 0,
    },
    tcsRate: {
      type: Number,
      default: 0,
    },
    tcsAmount: {
      type: Number,
      default: 0,
    },
    isDelegationPayment: {
      type: Boolean,
      default: false,
      index: true,
    },
    installmentNumber: {
      type: Number,
      default: null,
    },
    installmentTitle: {
      type: String,
      default: "",
    },
    amount: {
      type: Number,
      required: true, // Total amount including GST
    },
    currency: {
      type: String,
      default: "INR",
    },
    method: {
      type: String,
      default: "UPI",
    },
    status: {
      type: String,
      enum: Object.values(STATUSES.PAYMENT),
      default: STATUSES.PAYMENT.PAID,
      index: true,
    },
    transactionId: {
      type: String,
      default: "",
    },
    paidAt: {
      type: Date,
      default: Date.now,
    },
    verificationToken: {
      type: String,
      index: true,
      default: null,
    },
    payerName: {
      type: String,
      default: "",
    },
    payerEmail: {
      type: String,
      default: "",
    },
    payerPhone: {
      type: String,
      default: "",
    },
    businessName: {
      type: String,
      default: "",
    },
    gstin: {
      type: String,
      default: "",
    },
    sacCode: {
      type: String,
      default: "9983",
    },
    quantity: {
      type: Number,
      default: 1,
    },
    notes: {
      type: String,
      default: "",
    },
    isCustomInvoice: {
      type: Boolean,
      default: false,
      index: true,
    },
    isRevoked: {
      type: Boolean,
      default: false,
    },
    revokedAt: {
      type: Date,
      default: null,
    },
    revokedReason: {
      type: String,
      default: "",
    },
    revokedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
  },
  { timestamps: true }
);

export const Payment = mongoose.model("Payment", paymentSchema);
export default Payment;
