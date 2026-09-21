import mongoose from "mongoose";

/**
 * One photo or video inside an event's gallery folder.
 *
 * Scope fields (chapter / state / visibilityScope) are denormalised from the parent event
 * at upload time so the gallery can be filtered and access-checked without a $lookup on
 * every read.
 */
const eventMediaSchema = new mongoose.Schema(
  {
    event: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Event",
      required: true,
      index: true,
    },
    type: {
      type: String,
      enum: ["image", "video"],
      required: true,
      index: true,
    },
    url: {
      type: String,
      required: true,
    },
    caption: {
      type: String,
      default: "",
      trim: true,
    },
    mimetype: { type: String, default: "" },
    size: { type: Number, default: 0 },
    uploadedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      index: true,
    },
    // ─── Denormalised event scope (drives who may view this media) ───────────
    chapter: { type: String, default: "", index: true },
    state: { type: String, default: "", index: true },
    visibilityScope: {
      type: String,
      enum: ["global", "state", "chapter"],
      default: "global",
      index: true,
    },
    // The event's own date, so the gallery can be searched by when it happened
    // rather than by when the media was uploaded.
    eventDate: { type: String, default: "", index: true },
  },
  { timestamps: true }
);

eventMediaSchema.index({ event: 1, createdAt: -1 });

export const EventMedia = mongoose.model("EventMedia", eventMediaSchema);
export default EventMedia;
