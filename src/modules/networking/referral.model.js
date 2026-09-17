import mongoose from "mongoose";

const referralSchema = new mongoose.Schema(
  {
    // The member who made the referral
    referrerUser: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    referrerBusiness: { type: mongoose.Schema.Types.ObjectId, ref: "Business", required: true },
    referrerChapterId: { type: mongoose.Schema.Types.ObjectId, ref: "Chapter", required: true, index: true },
    referrerState: { type: String, required: true, trim: true },

    // The member the referral was given to
    referredUser: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    referredBusiness: { type: mongoose.Schema.Types.ObjectId, ref: "Business", required: true },
    referredChapterId: { type: mongoose.Schema.Types.ObjectId, ref: "Chapter", required: true, index: true },
    referredState: { type: String, required: true, trim: true },

    // The lead: a friend/contact of the referrer, who need not be a RIFAH member
    leadName: { type: String, required: true, trim: true },
    leadContact: { type: String, default: "", trim: true },
    leadIsMember: { type: Boolean, default: false },

    description: { type: String, required: true, trim: true },

    status: { type: String, enum: ["Open", "Closed"], default: "Open", index: true },
    thankYouNote: { type: mongoose.Schema.Types.ObjectId, ref: "ThankYouNote", default: null },
    closedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

referralSchema.index({ referrerState: 1 });
referralSchema.index({ referredState: 1 });

export const Referral = mongoose.model("Referral", referralSchema);
export default Referral;
