import { thankYouNoteService } from "./thank-you-note.service.js";
import { asyncHandler } from "../../shared/utils/async-handler.js";
import { ApiResponse } from "../../shared/utils/response.js";
import { auditService } from "../audit/audit.service.js";

export const thankYouNoteController = {
  create: asyncHandler(async (req, res) => {
    const record = await thankYouNoteService.create(req.user.id, req.body);
    await auditService.logAction({
      actor: req.user,
      action: "CREATE",
      targetModel: "ThankYouNote",
      targetId: record._id,
      summary: `Sent a thank you note to ${record.giverBusiness?.name || "a member"} for business worth ${record.amount}`,
      ipAddress: req.ip,
    });
    return ApiResponse.created(res, record, "Thank you note recorded successfully");
  }),

  listMine: asyncHandler(async (req, res) => {
    const { records, meta } = await thankYouNoteService.listMine(req.user.id, req.query);
    return ApiResponse.success(res, records, "Thank you notes retrieved", 200, meta);
  }),

  listForAdmin: asyncHandler(async (req, res) => {
    const { records, meta } = await thankYouNoteService.listForAdmin(req.user, req.query);
    return ApiResponse.success(res, records, "Thank you notes retrieved", 200, meta);
  }),

  summaryForMe: asyncHandler(async (req, res) => {
    const summary = await thankYouNoteService.summaryForUser(req.user.id);
    return ApiResponse.success(res, summary, "Summary retrieved");
  }),

  getById: asyncHandler(async (req, res) => {
    const record = await thankYouNoteService.getById(req.params.id, req.user);
    return ApiResponse.success(res, record, "Thank you note retrieved");
  }),
};
