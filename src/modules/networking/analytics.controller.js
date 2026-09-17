import { analyticsService } from "./analytics.service.js";
import { asyncHandler } from "../../shared/utils/async-handler.js";
import { ApiResponse } from "../../shared/utils/response.js";

export const analyticsController = {
  overview: asyncHandler(async (req, res) => {
    const data = await analyticsService.overview(req.user);
    return ApiResponse.success(res, data, "Networking analytics overview retrieved");
  }),

  leaderboard: asyncHandler(async (req, res) => {
    const data = await analyticsService.leaderboard(req.user, req.query);
    return ApiResponse.success(res, data, "Leaderboard retrieved");
  }),

  breakdown: asyncHandler(async (req, res) => {
    const data = await analyticsService.breakdown(req.user, req.query);
    return ApiResponse.success(res, data, "Breakdown retrieved");
  }),

  publicStateTotals: asyncHandler(async (req, res) => {
    const data = await analyticsService.publicStateTotals();
    return ApiResponse.success(res, data, "State-wise business generated retrieved");
  }),
};
