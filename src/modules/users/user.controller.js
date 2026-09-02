import { userService } from "./user.service.js";
import { asyncHandler } from "../../shared/utils/async-handler.js";
import { ApiResponse } from "../../shared/utils/response.js";

export const userController = {
  getMe: asyncHandler(async (req, res) => {
    const user = await userService.getUserById(req.user.id);
    return ApiResponse.success(res, user, "User profile retrieved");
  }),

  updateMe: asyncHandler(async (req, res) => {
    const updatedUser = await userService.updateProfile(req.user.id, req.body);
    return ApiResponse.success(res, updatedUser, "Profile updated successfully");
  }),

  toggleSaveBusiness: asyncHandler(async (req, res) => {
    const { businessId } = req.params;
    const result = await userService.toggleSaveBusiness(req.user.id, businessId);
    return ApiResponse.success(
      res,
      result,
      result.saved ? "Business saved to bookmarks" : "Business removed from bookmarks"
    );
  }),

  listUsers: asyncHandler(async (req, res) => {
    const { users, meta } = await userService.listUsers(req.query, req.user);
    return ApiResponse.success(res, users, "Users list retrieved", 200, meta);
  }),

  updateUserStatus: asyncHandler(async (req, res) => {
    const { id } = req.params;
    const updated = await userService.updateUserStatus(id, req.body);
    return ApiResponse.success(res, updated, "User status updated successfully");
  }),
};
