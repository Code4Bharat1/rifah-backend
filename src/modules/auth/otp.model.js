import mongoose from "mongoose";

const otpVerificationSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
      index: true,
    },
    otp: {
      type: String,
      required: true,
      trim: true,
    },
    purpose: {
      type: String,
      default: "register_business",
    },
    verified: {
      type: Boolean,
      default: false,
    },
    verifiedToken: {
      type: String,
      default: null,
    },
    expiresAt: {
      type: Date,
      required: true,
      index: { expires: 0 }, // TTL index auto deletes document when expiresAt is reached
    },
  },
  {
    timestamps: true,
  }
);

export const OtpVerification = mongoose.model("OtpVerification", otpVerificationSchema);
export default OtpVerification;
