import mongoose from "mongoose";

const fileSchema = new mongoose.Schema(
  {
    filename: {
      type: String,
      required: true,
      trim: true,
    },
    mimetype: {
      type: String,
      required: true,
    },
    data: {
      type: Buffer,
      required: true,
    },
    size: {
      type: Number,
      default: 0,
    },
    uploadedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
  },
  {
    timestamps: true,
  }
);

// We do not want to return the binary buffer by default when fetching file metadata
fileSchema.methods.toJSON = function () {
  const obj = this.toObject();
  delete obj.data;
  return obj;
};

export const File = mongoose.model("File", fileSchema);
export default File;
