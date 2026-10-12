import { visaReferralService } from "./visa-referral.service.js";
import { asyncHandler } from "../../shared/utils/async-handler.js";
import { ApiResponse } from "../../shared/utils/response.js";
import { storageService } from "../../infrastructure/storage/storage.service.js";
import { BadRequestError } from "../../shared/errors/errors.js";

export const visaReferralController = {
  /**
   * Upload supporting document (Passport, Invitation, Proof, etc.)
   */
  uploadDocument: asyncHandler(async (req, res) => {
    if (!req.file) {
      throw new BadRequestError("No document file provided for upload");
    }
    const url = await storageService.uploadFile(req.file, "visa-referrals");
    return ApiResponse.success(res, { url }, "Visa document uploaded successfully");
  }),

  /**
   * Submit Visa Referral Application (Open to everyone)
   */
  create: asyncHandler(async (req, res) => {
    const application = await visaReferralService.create(req.body, req.user || null);
    return ApiResponse.success(
      res,
      application,
      "Visa referral application submitted successfully. Reference number generated.",
      201
    );
  }),

  /**
   * List logged in user's visa referrals
   */
  listUser: asyncHandler(async (req, res) => {
    const applications = await visaReferralService.listUserApplications(req.user);
    return ApiResponse.success(res, applications, "My visa referral applications retrieved");
  }),

  /**
   * Central Admin Only: Paginated list
   */
  listAdmin: asyncHandler(async (req, res) => {
    const result = await visaReferralService.listAdmin(req.query);
    return ApiResponse.success(res, result.items, "Visa referrals retrieved", 200, result.pagination);
  }),

  /**
   * Central Admin Only: Overall Stats
   */
  getStats: asyncHandler(async (req, res) => {
    const stats = await visaReferralService.getStats();
    return ApiResponse.success(res, stats, "Visa referral statistics retrieved");
  }),

  /**
   * Central Admin Only: Single detail
   */
  getById: asyncHandler(async (req, res) => {
    const application = await visaReferralService.getById(req.params.id);
    return ApiResponse.success(res, application, "Visa referral detail retrieved");
  }),

  /**
   * Central Admin Only: Update status
   */
  updateStatus: asyncHandler(async (req, res) => {
    const { id } = req.params;
    const updated = await visaReferralService.updateStatus(id, req.body, req.user);
    return ApiResponse.success(res, updated, `Status updated to ${updated.status}`);
  }),

  /**
   * Central Admin Only: Deliver Referral Letter by Post / Courier
   */
  deliverLetter: asyncHandler(async (req, res) => {
    const { id } = req.params;
    const delivered = await visaReferralService.deliverLetter(id, req.body, req.user);
    return ApiResponse.success(
      res,
      delivered,
      `Official Chamber Referral Letter marked as dispatched by post (${delivered.postalDispatch?.courierProvider || "Courier"})`
    );
  }),
};
