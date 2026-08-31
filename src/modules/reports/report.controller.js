import { reportService } from "./report.service.js";
import { businessService } from "../businesses/business.service.js";
import { asyncHandler } from "../../shared/utils/async-handler.js";
import { ApiResponse } from "../../shared/utils/response.js";
import { NotFoundError } from "../../shared/errors/errors.js";

export const reportController = {
  getBusinessAnalytics: asyncHandler(async (req, res) => {
    const business = await businessService.getBusinessByOwnerId(req.user.id);
    if (!business) {
      throw new NotFoundError("No business found for this account");
    }
    const stats = await reportService.getBusinessAnalytics(business._id);
    return ApiResponse.success(res, stats, "Business analytics retrieved");
  }),

  getAdminOverview: asyncHandler(async (req, res) => {
    const stats = await reportService.getAdminOverview();
    return ApiResponse.success(res, stats, "Chamber KPI metrics retrieved");
  }),
};
