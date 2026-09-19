import mongoose from "mongoose";

const documentSchema = new mongoose.Schema(
  {
    title: { type: String, required: true },
    type: { type: String, required: true },
    category: { type: String, default: "General" },
    fileUrl: { type: String, required: true },
    size: { type: String, required: true },
    uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    chapter: { type: String }, // Optional, if empty it's global
    roleAccess: [{ type: String }], // Array of roles allowed to view, if empty all roles can view
    status: { type: String, enum: ["Active", "Archived"], default: "Active" },
  },
  { timestamps: true }
);

export const Document = mongoose.model("Document", documentSchema);
