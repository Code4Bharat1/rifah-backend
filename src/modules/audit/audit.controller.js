import { auditService } from "./audit.service.js";
import { asyncHandler } from "../../shared/utils/async-handler.js";
import { ApiResponse } from "../../shared/utils/response.js";

export const auditController = {
  listAuditLogs: asyncHandler(async (req, res) => {
    const { logs, meta } = await auditService.listAuditLogs(req.query);
    return ApiResponse.success(res, logs, "Audit logs retrieved", 200, meta);
  }),
};
