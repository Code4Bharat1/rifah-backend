import { businessService } from "./business.service.js";
import { gstService } from "./gst.service.js";
import { asyncHandler } from "../../shared/utils/async-handler.js";
import { ApiResponse } from "../../shared/utils/response.js";
import { storageService } from "../../infrastructure/storage/storage.service.js";

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

  createBusiness: asyncHandler(async (req, res) => {
    const business = await businessService.createBusiness(req.body, req.user.id);
    return ApiResponse.created(res, business, "Business profile created successfully");
  }),

  updateBusiness: asyncHandler(async (req, res) => {
    const { id } = req.params;
    const updated = await businessService.updateBusiness(id, req.body, req.user);
    return ApiResponse.success(res, updated, "Business updated successfully");
  }),

  uploadLogo: asyncHandler(async (req, res) => {
    const { id } = req.params;
    if (!req.file) {
      return ApiResponse.error(res, "No image file uploaded", 400);
    }
    const fileUrl = storageService.getPublicUrl(req.file.filename, "logos");
    const updated = await businessService.updateBusiness(id, { logo: fileUrl }, req.user);
    return ApiResponse.success(res, { logo: fileUrl, business: updated }, "Logo uploaded successfully");
  }),

  uploadCover: asyncHandler(async (req, res) => {
    const { id } = req.params;
    if (!req.file) {
      return ApiResponse.error(res, "No image file uploaded", 400);
    }
    const fileUrl = storageService.getPublicUrl(req.file.filename, "covers");
    const updated = await businessService.updateBusiness(id, { coverImage: fileUrl }, req.user);
    return ApiResponse.success(res, { coverImage: fileUrl, business: updated }, "Cover image uploaded successfully");
  }),

  uploadGallery: asyncHandler(async (req, res) => {
    const { id } = req.params;
    if (!req.files || req.files.length === 0) {
      return ApiResponse.error(res, "No image files uploaded", 400);
    }
    const newUrls = req.files.map((f) => storageService.getPublicUrl(f.filename, "gallery"));
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
    const fileUrl = storageService.getPublicUrl(req.file.filename, "certificates");
    const business = await businessService.getBusinessBySlugOrId(id);
    const updatedCertificates = [...(business.certifications || []), fileUrl];
    const updated = await businessService.updateBusiness(id, { certifications: updatedCertificates }, req.user);
    return ApiResponse.success(res, { certificates: updatedCertificates, business: updated }, "Certificate uploaded successfully");
  }),

  updateStatus: asyncHandler(async (req, res) => {
    const { id } = req.params;
    const updated = await businessService.updateStatus(id, req.body);
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
};
