import mongoose from "mongoose";

const thankYouNoteSchema = new mongoose.Schema(
  {
    // The member who generated/gave business to another member
    giverUser: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    giverBusiness: { type: mongoose.Schema.Types.ObjectId, ref: "Business", required: true },
    giverChapterId: { type: mongoose.Schema.Types.ObjectId, ref: "Chapter", required: true, index: true },
    giverState: { type: String, required: true, trim: true },

    // The member who received the business
    receiverUser: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    receiverBusiness: { type: mongoose.Schema.Types.ObjectId, ref: "Business", required: true },
    receiverChapterId: { type: mongoose.Schema.Types.ObjectId, ref: "Chapter", required: true, index: true },
    receiverState: { type: String, required: true, trim: true },

    amount: { type: Number, required: true, min: 1 },
    note: { type: String, default: "", trim: true },
  },
  { timestamps: true }
);

thankYouNoteSchema.index({ giverState: 1 });
thankYouNoteSchema.index({ receiverState: 1 });

export const ThankYouNote = mongoose.model("ThankYouNote", thankYouNoteSchema);
export default ThankYouNote;
