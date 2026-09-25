import { businessService } from "./business.service.js";
import { gstService } from "./gst.service.js";
import { asyncHandler } from "../../shared/utils/async-handler.js";
import { ApiResponse } from "../../shared/utils/response.js";
import { storageService } from "../../infrastructure/storage/storage.service.js";
import { auditService } from "../audit/audit.service.js";

export const businessController = {
  searchDirectory: asyncHandler(async (req, res) => {
    const { businesses, meta } = await businessService.searchDirectory(req.query, req.user);
    return ApiResponse.success(res, businesses, "Businesses directory retrieved", 200, meta);
  }),

  getBusinessByIdOrSlug: asyncHandler(async (req, res) => {
    const { identifier } = req.params;
    const business = await businessService.getBusinessBySlugOrId(identifier);
    return ApiResponse.success(res, business, "Business details retrieved");
  }),

  getMyBusiness: asyncHandler(async (req, res) => {
    const business = await businessService.getBusinessByOwnerId(req.user.id);
    return ApiResponse.success(res, business, "My business profile retrieved");
  }),

  getNewChapterMembers: asyncHandler(async (req, res) => {
    const members = await businessService.getNewChapterMembers(req.user);
    return ApiResponse.success(res, members, "New chapter members retrieved");
  }),

  createBusiness: asyncHandler(async (req, res) => {
    const business = await businessService.createBusiness(req.body, req.user.id);
    return ApiResponse.created(res, business, "Business profile created successfully");
  }),

  createBusinessByAdmin: asyncHandler(async (req, res) => {
    const business = await businessService.createBusinessByAdmin(req.user, req.body);
    
    await auditService.logAction({
      actor: req.user,
      action: "CREATE",
      targetModel: "Business",
      targetId: business._id,
      summary: `Admin created business ${business.name} directly`,
      ipAddress: req.ip
    });

    return ApiResponse.created(res, business, "Business registered successfully by Admin");
  }),

  updateBusiness: asyncHandler(async (req, res) => {
    const { id } = req.params;
    const updated = await businessService.updateBusiness(id, req.body, req.user);
    return ApiResponse.success(res, updated, "Business updated successfully");
  }),

  uploadLogo: asyncHandler(async (req, res) => {
    const { id } = req.params;
    // req.files is populated by upload.fields([...]) with one array per accepted
    // field name alias — pick whichever alias the client actually used.
    const files = req.files || {};
    const file = (files.logo || files.logoImage || files.file || files.image || [])[0];
    if (!file) {
      return ApiResponse.error(res, "No image file uploaded", 400);
    }
    const fileUrl = await storageService.uploadFile(file, "logos");
    const updated = await businessService.updateBusiness(id, { logo: fileUrl }, req.user);
    return ApiResponse.success(res, { logo: fileUrl, business: updated }, "Logo uploaded successfully");
  }),

  uploadCover: asyncHandler(async (req, res) => {
    const { id } = req.params;
    const files = req.files || {};
    const file = (files.cover || files.coverImage || files.banner || files.bannerImage || files.file || files.image || [])[0];
    if (!file) {
      return ApiResponse.error(res, "No image file uploaded", 400);
    }
    const fileUrl = await storageService.uploadFile(file, "covers");
    const updated = await businessService.updateBusiness(id, { coverImage: fileUrl }, req.user);
    return ApiResponse.success(res, { coverImage: fileUrl, business: updated }, "Cover image uploaded successfully");
  }),

  uploadGallery: asyncHandler(async (req, res) => {
    const { id } = req.params;
    const files = req.files || {};
    const galleryFiles = [
      ...(files.gallery || []),
      ...(files.photos || []),
      ...(files.images || []),
      ...(files.files || []),
    ];
    if (galleryFiles.length === 0) {
      return ApiResponse.error(res, "No image files uploaded", 400);
    }
    const newUrls = await Promise.all(galleryFiles.map((f) => storageService.uploadFile(f, "gallery")));
    const business = await businessService.getBusinessBySlugOrId(id);
    const updatedGallery = [...(business.gallery || []), ...newUrls];
    const updated = await businessService.updateBusiness(id, { gallery: updatedGallery }, req.user);
    return ApiResponse.success(res, { gallery: updatedGallery, business: updated }, "Gallery photos uploaded successfully");
  }),

  uploadCertificate: asyncHandler(async (req, res) => {
    const { id } = req.params;
    if (!req.file) {
      return ApiResponse.error(res, "No certificate file uploaded", 400);
    }
    const fileUrl = await storageService.uploadFile(req.file, "certificates");
    const business = await businessService.getBusinessBySlugOrId(id);
    const updatedCertificates = [...(business.certifications || []), fileUrl];
    const updated = await businessService.updateBusiness(id, { certifications: updatedCertificates }, req.user);
    return ApiResponse.success(res, { certificates: updatedCertificates, business: updated }, "Certificate uploaded successfully");
  }),

  updateStatus: asyncHandler(async (req, res) => {
    const { id } = req.params;
    const updated = await businessService.updateStatus(id, req.body, req.user);
    
    // Log the significant status changes
    let summaryParts = [];
    if (req.body.verification) summaryParts.push(`verification to ${req.body.verification}`);
    if (req.body.membership) summaryParts.push(`membership to ${req.body.membership}`);
    if (req.body.status) summaryParts.push(`status to ${req.body.status}`);
    
    if (summaryParts.length > 0) {
      let action = "UPDATE";
      if (req.body.verification === "Verified") action = "VERIFY_APPROVE";
      else if (req.body.verification === "Rejected") action = "VERIFY_REJECT";
      else if (req.body.verification === "Correction Requested") action = "VERIFY_CORRECTION";

      await auditService.logAction({
        actor: req.user,
        action,
        targetModel: "Business",
        targetId: updated._id,
        summary: `Updated business ${updated.name}: ${summaryParts.join(', ')}`,
        ipAddress: req.ip
      });
    }

    return ApiResponse.success(res, updated, "Business status updated successfully");
  }),

  verifyGst: asyncHandler(async (req, res) => {
    const { gstin } = req.body;
    const result = await gstService.verifyGst(gstin);
    return ApiResponse.success(res, result, "GSTIN verified successfully");
  }),

  getGstDetails: asyncHandler(async (req, res) => {
    const { gstin } = req.body;
    const result = await gstService.fetchDetails(gstin);
    return ApiResponse.success(res, result, "Company details retrieved from GSTIN");
  }),

  getNewChapterMembers: asyncHandler(async (req, res) => {
    const newMembers = await businessService.getNewChapterMembers(req.user);
    return ApiResponse.success(res, { newMembers }, "New chapter members fetched successfully");
  }),
};
