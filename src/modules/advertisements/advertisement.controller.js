import { advertisementService } from "./advertisement.service.js";
import { asyncHandler } from "../../shared/utils/async-handler.js";
import { ApiResponse } from "../../shared/utils/response.js";
import { storageService } from "../../infrastructure/storage/storage.service.js";

export const advertisementController = {
  /**
   * Create & Submit Ad
   */
  createAdvertisement: asyncHandler(async (req, res) => {
    let bannerImageUrl = req.body.bannerImage;

    // Handle uploaded file if present
    const files = req.files || {};
    const file = req.file || (files.banner || files.bannerImage || files.image || files.file || [])[0];

    if (file) {
      const allowedMimes = ["image/jpeg", "image/png", "image/webp", "image/jpg"];
      if (!allowedMimes.includes(file.mimetype)) {
        return ApiResponse.error(res, "Only JPG, PNG, and WEBP image files are allowed for advertisement banners.", 400);
      }
      if (file.size > 5 * 1024 * 1024) {
        return ApiResponse.error(res, "Banner image file size must not exceed 5MB.", 400);
      }
      bannerImageUrl = await storageService.uploadFile(file, "advertisements");
    }

    if (!bannerImageUrl) {
      return ApiResponse.error(res, "Banner image is required for advertisement", 400);
    }

    const payload = {
      ...req.body,
      bannerImage: bannerImageUrl,
    };

    const ad = await advertisementService.createAdvertisement(payload, req.user);
    const scopeLabel = ad.targetScope === "global" ? "Central Admin" : ad.targetScope === "state" ? "State Admin" : "Chapter Admin";
    return ApiResponse.created(res, ad, `Advertisement submitted to ${scopeLabel} for verification.`);
  }),

  /**
   * Get Active Ads for Dashboard Banner Carousel (Global + State + Chapter)
   */
  getActiveAdvertisements: asyncHandler(async (req, res) => {
    const activeAds = await advertisementService.getActiveAdvertisements(req.user);
    return ApiResponse.success(res, activeAds, "Active advertisements retrieved");
  }),

  /**
   * Get User's Own Submitted Ads
   */
  getMyAdvertisements: asyncHandler(async (req, res) => {
    const ads = await advertisementService.getMyAdvertisements(req.user);
    return ApiResponse.success(res, ads, "My advertisements retrieved");
  }),

  /**
   * Get Admin Ads Queue (Chapter Admin, State Admin, or Central Admin)
   */
  getAdminAdvertisements: asyncHandler(async (req, res) => {
    const ads = await advertisementService.getAdminAdvertisements(req.user, req.query);
    return ApiResponse.success(res, ads, "Admin advertisements retrieved");
  }),

  /**
   * Backward-compatible alias for Chapter Admin
   */
  getChapterAdvertisements: asyncHandler(async (req, res) => {
    const ads = await advertisementService.getAdminAdvertisements(req.user, req.query);
    return ApiResponse.success(res, ads, "Chapter advertisements retrieved");
  }),

  /**
   * Review Ad (Approve with duration or Reject)
   */
  reviewAdvertisement: asyncHandler(async (req, res) => {
    const { id } = req.params;
    const reviewed = await advertisementService.reviewAdvertisement(id, req.body, req.user);
    return ApiResponse.success(res, reviewed, "Advertisement review saved");
  }),

  /**
   * Get Calendar Slots with Privacy Masking for chosen scope
   */
  getCalendarSlots: asyncHandler(async (req, res) => {
    const { month, year, targetScope } = req.query;
    const slots = await advertisementService.getCalendarSlots(month, year, targetScope, req.user);
    return ApiResponse.success(res, slots, "Advertisement calendar slots retrieved");
  }),

  /**
   * Delete / Cancel Ad
   */
  deleteAdvertisement: asyncHandler(async (req, res) => {
    const { id } = req.params;
    const result = await advertisementService.deleteAdvertisement(id, req.user);
    return ApiResponse.success(res, result, "Advertisement removed successfully");
  }),
};

export default advertisementController;
