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
    itemType: {
      type: String,
      enum: ["Membership", "Event Pass", "Sponsorship", "Directory Addon"],
      default: "Membership",
    },
    description: {
      type: String,
      default: "Annual Membership Fee",
    },
    amount: {
      type: Number,
      required: true,
    },
    currency: {
      type: String,
      default: "INR",
    },
    method: {
      type: String,
      enum: ENUMS.PAYMENT_METHODS,
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
  },
  {
    timestamps: true,
  }
);

export const Payment = mongoose.model("Payment", paymentSchema);
export default Payment;
