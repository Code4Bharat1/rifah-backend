import mongoose from "mongoose";

const certificateSchema = new mongoose.Schema(
  {
    businessId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Business",
      required: true,
      index: true,
    },
    courseId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Course",
      required: true,
      index: true,
    },
    pdfUrl: {
      type: String,
      required: true,
    },
    issuedAt: {
      type: Date,
      default: Date.now,
    },
    certificateNumber: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

// A business should generally only get one certificate per course
certificateSchema.index({ businessId: 1, courseId: 1 }, { unique: true });

export const Certificate = mongoose.model("Certificate", certificateSchema);
export default Certificate;
