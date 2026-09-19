import { centralAdminService } from "./central-admin.service.js";
import { asyncHandler } from "../../shared/utils/async-handler.js";
import { ApiResponse } from "../../shared/utils/response.js";
import { auditService } from "../audit/audit.service.js";

export const centralAdminController = {
  getCurrent: asyncHandler(async (req, res) => {
    const admin = await centralAdminService.getCurrent();
    return ApiResponse.success(res, admin, "Current central admin retrieved");
  }),

  transfer: asyncHandler(async (req, res) => {
    const newAdmin = await centralAdminService.transfer(req.body.businessId);
    await auditService.logAction({
      actor: req.user,
      action: "UPDATE",
      targetModel: "User",
      targetId: newAdmin._id,
      summary: `Transferred Central Admin role to ${newAdmin.name} (${newAdmin.email})`,
      ipAddress: req.ip,
    });
    return ApiResponse.success(res, newAdmin, "Central Admin transferred successfully");
  }),
};

export default centralAdminController;
