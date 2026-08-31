import mongoose from "mongoose";

export const isValidObjectId = (id) => {
  return mongoose.Types.ObjectId.isValid(id) && String(new mongoose.Types.ObjectId(id)) === String(id);
};

export const validateObjectIdParam = (paramName = "id") => {
  return (req, res, next) => {
    const id = req.params[paramName];
    if (!id || !isValidObjectId(id)) {
      return res.status(400).json({
        success: false,
        error: {
          code: "INVALID_ID_FORMAT",
          message: `Invalid ID format for parameter '${paramName}'. Must be a valid MongoDB ObjectId.`,
        },
      });
    }
    next();
  };
};
