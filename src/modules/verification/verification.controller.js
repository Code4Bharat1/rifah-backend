import { verificationService } from "./verification.service.js";
import { Business } from "../businesses/business.model.js";
import { asyncHandler } from "../../shared/utils/async-handler.js";
import { ApiResponse } from "../../shared/utils/response.js";
import { storageService } from "../../infrastructure/storage/storage.service.js";
import { auditService } from "../audit/audit.service.js";
import path from "path";
import { fileURLToPath } from "url";
import { env } from "../../config/env.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const verificationController = {
  submitVerification: asyncHandler(async (req, res) => {
    let { businessId, documents, notes } = req.body;
    if (!businessId && req.user?.id) {
      const biz = await Business.findOne({ owner: req.user.id });
      if (biz) {
        businessId = biz._id;
      }
    }
    const verification = await verificationService.submitVerification(
      businessId,
      documents || [],
      req.user,
      notes || ""
    );
    return ApiResponse.success(res, verification, "Verification submitted for review");
  }),

  uploadDocument: asyncHandler(async (req, res) => {
    if (!req.file) {
      return ApiResponse.error(res, "No document file uploaded", 400);
    }
    const fileUrl = await storageService.uploadFile(req.file, "documents");
    return ApiResponse.success(
      res,
      { fileUrl, originalName: req.file.originalname },
      "Document uploaded successfully"
    );
  }),

  getVerificationStatus: asyncHandler(async (req, res) => {
    const { businessId } = req.params;
    const verification = await verificationService.getVerificationByBusinessId(businessId, req.user);
    return ApiResponse.success(res, verification, "Verification status retrieved");
  }),

  listVerifications: asyncHandler(async (req, res) => {
    const { verifications, meta } = await verificationService.listVerifications(req.query, req.user);
    return ApiResponse.success(res, verifications, "Verification queue retrieved", 200, meta);
  }),

  reviewVerification: asyncHandler(async (req, res) => {
    console.log("REACHED REVIEW VERIFICATION:", req.params.id, req.body);
    const { id } = req.params;
    const status = req.body.status || req.body.decision;
    const remarks = req.body.remarks || req.body.notes || "";
    const reviewed = await verificationService.reviewVerification(
      id,
      { status, remarks },
      req.user
    );

    let actionType = "UPDATE";
    let actionSummary = `Updated verification status to ${reviewed.status}`;
    
    if (reviewed.status === "verified" || reviewed.status === "approved") {
      actionType = "VERIFY_APPROVE";
      actionSummary = `Approved business verification for ${reviewed.business?.name || 'business'}`;
    } else if (reviewed.status === "rejected") {
      actionType = "VERIFY_REJECT";
      actionSummary = `Rejected business verification for ${reviewed.business?.name || 'business'}`;
    } else if (reviewed.status === "correction_requested" || reviewed.status === "correction") {
      actionType = "VERIFY_CORRECTION";
      actionSummary = `Requested corrections for business verification of ${reviewed.business?.name || 'business'}`;
    }

    await auditService.logAction({
      actor: req.user,
      action: actionType,
      targetModel: "Verification",
      targetId: id,
      summary: actionSummary,
      ipAddress: req.ip
    });

    return ApiResponse.success(res, reviewed, "Verification status updated successfully");
  }),

  downloadDocument: asyncHandler(async (req, res) => {
    const { filename } = req.params;
    const documentPath = await verificationService.getSecureDocumentPath(filename, req.user);
    
    const uploadsPath = path.resolve(__dirname, `../../../../${env.STORAGE.UPLOAD_DIR}`);
    // fileUrl in DB is like "uploads/documents/17000000.pdf", so documentPath is relative.
    // Wait, verificationService will return the absolute path or validate it.
    // Let's pass resolving to service or do it here.
    const absolutePath = path.resolve(uploadsPath, "..", documentPath);
    
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Content-Security-Policy", "frame-ancestors *");
    if (filename.endsWith(".pdf")) {
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", "inline");
    }
    
    return res.sendFile(absolutePath);
  }),
};
