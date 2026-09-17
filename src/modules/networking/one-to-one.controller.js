import { oneToOneService } from "./one-to-one.service.js";
import { asyncHandler } from "../../shared/utils/async-handler.js";
import { ApiResponse } from "../../shared/utils/response.js";
import { auditService } from "../audit/audit.service.js";

export const oneToOneController = {
  create: asyncHandler(async (req, res) => {
    const record = await oneToOneService.create(req.user.id, req.body);
    await auditService.logAction({
      actor: req.user,
      action: "CREATE",
      targetModel: "OneToOne",
      targetId: record._id,
      summary: `Logged a one-to-one meeting with ${record.memberBusiness?.name || "a member"}`,
      ipAddress: req.ip,
    });
    return ApiResponse.created(res, record, "One-to-one meeting recorded successfully");
  }),

  listMine: asyncHandler(async (req, res) => {
    const { records, meta } = await oneToOneService.listMine(req.user.id, req.query);
    return ApiResponse.success(res, records, "One-to-one meetings retrieved", 200, meta);
  }),

  listForAdmin: asyncHandler(async (req, res) => {
    const { records, meta } = await oneToOneService.listForAdmin(req.user, req.query);
    return ApiResponse.success(res, records, "One-to-one meetings retrieved", 200, meta);
  }),

  getById: asyncHandler(async (req, res) => {
    const record = await oneToOneService.getById(req.params.id, req.user);
    return ApiResponse.success(res, record, "One-to-one meeting retrieved");
  }),
};
