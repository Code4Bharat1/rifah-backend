import { verificationService } from "./verification.service.js";
import { asyncHandler } from "../../shared/utils/async-handler.js";
import { ApiResponse } from "../../shared/utils/response.js";
import { storageService } from "../../infrastructure/storage/storage.service.js";

export const verificationController = {
  submitVerification: asyncHandler(async (req, res) => {
    const { businessId, documents } = req.body;
    const verification = await verificationService.submitVerification(
      businessId,
      documents || [],
      req.user
    );
    return ApiResponse.success(res, verification, "Verification submitted for review");
  }),

  uploadDocument: asyncHandler(async (req, res) => {
    if (!req.file) {
      return ApiResponse.error(res, "No document file uploaded", 400);
    }
    const fileUrl = storageService.getPublicUrl(req.file.filename, "documents");
    return ApiResponse.success(
      res,
      { fileUrl, originalName: req.file.originalname },
      "Document uploaded successfully"
    );
  }),

  getVerificationStatus: asyncHandler(async (req, res) => {
    const { businessId } = req.params;
    const verification = await verificationService.getVerificationByBusinessId(businessId);
    return ApiResponse.success(res, verification, "Verification status retrieved");
  }),

  listVerifications: asyncHandler(async (req, res) => {
    const { verifications, meta } = await verificationService.listVerifications(req.query, req.user);
    return ApiResponse.success(res, verifications, "Verification queue retrieved", 200, meta);
  }),

  reviewVerification: asyncHandler(async (req, res) => {
    const { id } = req.params;
    const status = req.body.status || req.body.decision;
    const remarks = req.body.remarks || req.body.notes || "";
    const reviewed = await verificationService.reviewVerification(
      id,
      { status, remarks },
      req.user.id
    );
    return ApiResponse.success(res, reviewed, "Verification status updated successfully");
  }),
};
