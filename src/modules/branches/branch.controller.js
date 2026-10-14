import { branchService } from "./branch.service.js";
import { asyncHandler } from "../../shared/utils/async-handler.js";
import { ApiResponse } from "../../shared/utils/response.js";

export const branchController = {
  getMyBranches: asyncHandler(async (req, res) => {
    const data = await branchService.getMyBranches(req.user.id);
    return ApiResponse.success(res, data, "Branches retrieved successfully");
  }),

  createBranch: asyncHandler(async (req, res) => {
    const branch = await branchService.createBranch(req.user.id, req.body);
    return ApiResponse.created(res, branch, "Branch created successfully");
  }),

  updateBranch: asyncHandler(async (req, res) => {
    const { id } = req.params;
    const branch = await branchService.updateBranch(req.user.id, id, req.body);
    return ApiResponse.success(res, branch, "Branch updated successfully");
  }),

  toggleVisibility: asyncHandler(async (req, res) => {
    const { id } = req.params;
    const result = await branchService.toggleVisibility(req.user.id, id);
    return ApiResponse.success(res, result.branch, result.message);
  }),

  deleteBranch: asyncHandler(async (req, res) => {
    const { id } = req.params;
    const result = await branchService.deleteBranch(req.user.id, id);
    return ApiResponse.success(res, null, result.message);
  }),

  getPublicBranches: asyncHandler(async (req, res) => {
    const { businessId } = req.params;
    const branches = await branchService.getPublicBranches(businessId);
    return ApiResponse.success(res, branches, "Public branches retrieved");
  }),

  uploadImage: asyncHandler(async (req, res) => {
    if (!req.file) {
      return ApiResponse.error(res, "No image file provided", 400);
    }
    const result = await branchService.uploadBranchImage(req.file);
    return ApiResponse.success(res, result, "Branch image uploaded successfully");
  }),
};
