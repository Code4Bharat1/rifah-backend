import { referralService } from "./referral.service.js";
import { asyncHandler } from "../../shared/utils/async-handler.js";
import { ApiResponse } from "../../shared/utils/response.js";
import { auditService } from "../audit/audit.service.js";

export const referralController = {
  create: asyncHandler(async (req, res) => {
    const record = await referralService.create(req.user.id, req.body);
    await auditService.logAction({
      actor: req.user,
      action: "CREATE",
      targetModel: "Referral",
      targetId: record._id,
      summary: `Referred ${record.leadName} to ${record.referredBusiness?.name || "a member"}`,
      ipAddress: req.ip,
    });
    return ApiResponse.created(res, record, "Referral recorded successfully");
  }),

  close: asyncHandler(async (req, res) => {
    const record = await referralService.close(req.user.id, req.params.id, req.body);
    await auditService.logAction({
      actor: req.user,
      action: "UPDATE",
      targetModel: "Referral",
      targetId: record._id,
      summary: `Closed referral from ${record.referrerBusiness?.name || "a member"} with a thank you note`,
      ipAddress: req.ip,
    });
    return ApiResponse.success(res, record, "Referral closed with a thank you note");
  }),

  listMine: asyncHandler(async (req, res) => {
    const { records, meta } = await referralService.listMine(req.user.id, req.query);
    return ApiResponse.success(res, records, "Referrals retrieved", 200, meta);
  }),

  listForAdmin: asyncHandler(async (req, res) => {
    const { records, meta } = await referralService.listForAdmin(req.user, req.query);
    return ApiResponse.success(res, records, "Referrals retrieved", 200, meta);
  }),

  getById: asyncHandler(async (req, res) => {
    const record = await referralService.getById(req.params.id, req.user);
    return ApiResponse.success(res, record, "Referral retrieved");
  }),
};
