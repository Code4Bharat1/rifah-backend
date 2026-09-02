import { authService } from "./auth.service.js";
import { asyncHandler } from "../../shared/utils/async-handler.js";
import { ApiResponse } from "../../shared/utils/response.js";

export const authController = {
  register: asyncHandler(async (req, res) => {
    const result = await authService.register(req.body);
    return ApiResponse.created(res, result, "Account registered successfully");
  }),

  registerBusiness: asyncHandler(async (req, res) => {
    const result = await authService.registerBusinessOwner(req.body);
    return ApiResponse.created(res, result, "Business account registered successfully");
  }),

  login: asyncHandler(async (req, res) => {
    const result = await authService.login(req.body);
    return ApiResponse.success(res, result, "Logged in successfully");
  }),

  refreshToken: asyncHandler(async (req, res) => {
    const { refreshToken } = req.body;
    const result = await authService.refreshToken(refreshToken);
    return ApiResponse.success(res, result, "Access token refreshed successfully");
  }),

  getMe: asyncHandler(async (req, res) => {
    const user = await authService.getMe(req.user.id);
    return ApiResponse.success(res, user, "Session profile retrieved");
  }),

  logout: asyncHandler(async (req, res) => {
    return ApiResponse.success(res, null, "Logged out successfully");
  }),

  changePassword: asyncHandler(async (req, res) => {
    const result = await authService.changePassword(req.user.id, req.body);
    return ApiResponse.success(res, result, "Password updated successfully");
  }),

  forgotPassword: asyncHandler(async (req, res) => {
    const { email } = req.body;
    const result = await authService.forgotPassword(email);
    return ApiResponse.success(res, result, "Password reset code generated");
  }),

  resetPassword: asyncHandler(async (req, res) => {
    const result = await authService.resetPassword(req.body);
    return ApiResponse.success(res, result, "Password reset successfully");
  }),

  googleAuth: asyncHandler(async (req, res) => {
    const result = await authService.googleAuth(req.body);
    return ApiResponse.success(res, result, "Google authentication successful");
  }),

  completeOnboarding: asyncHandler(async (req, res) => {
    const result = await authService.completeOnboarding(req.user.id, req.body);
    return ApiResponse.success(res, result, "Profile setup and onboarding completed successfully");
  }),
};
