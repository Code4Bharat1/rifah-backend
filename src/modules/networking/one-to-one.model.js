import mongoose from "mongoose";

const oneToOneSchema = new mongoose.Schema(
  {
    // The member who logged this record
    initiatorUser: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    initiatorBusiness: { type: mongoose.Schema.Types.ObjectId, ref: "Business", required: true },
    initiatorChapterId: { type: mongoose.Schema.Types.ObjectId, ref: "Chapter", required: true, index: true },
    initiatorState: { type: String, required: true, trim: true },

    // The member who was met
    memberUser: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    memberBusiness: { type: mongoose.Schema.Types.ObjectId, ref: "Business", required: true },
    memberChapterId: { type: mongoose.Schema.Types.ObjectId, ref: "Chapter", required: true, index: true },
    memberState: { type: String, required: true, trim: true },

    meetingDate: { type: Date, required: true },
    meetingTime: { type: String, required: true, trim: true },
    location: { type: String, required: true, trim: true },
    description: { type: String, required: true, trim: true },

    // Who initiated the meeting, relative to initiatorUser
    initiatedBy: { type: String, enum: ["self", "member"], required: true },
  },
  { timestamps: true }
);

oneToOneSchema.index({ initiatorState: 1 });
oneToOneSchema.index({ memberState: 1 });

export const OneToOne = mongoose.model("OneToOne", oneToOneSchema);
export default OneToOne;
