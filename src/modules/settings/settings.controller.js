import { settingsService } from "./settings.service.js";
import { asyncHandler } from "../../shared/utils/async-handler.js";
import { ApiResponse } from "../../shared/utils/response.js";

export const settingsController = {
  getSettings: asyncHandler(async (req, res) => {
    const settings = await settingsService.getSettings();
    return ApiResponse.success(res, settings, "Settings retrieved successfully");
  }),

  updateSettings: asyncHandler(async (req, res) => {
    const updated = await settingsService.updateSettings(req.body);
    return ApiResponse.success(res, updated, "Settings updated successfully");
  }),
};
