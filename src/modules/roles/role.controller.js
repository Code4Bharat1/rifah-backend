import { roleService } from "./role.service.js";
import { ApiResponse } from "../../shared/utils/response.js";
import { asyncHandler } from "../../shared/utils/async-handler.js";

export const roleController = {
  // GET /api/v1/roles
  getAllRoles: asyncHandler(async (req, res) => {
    const result = await roleService.getAllRoles(req.query);
    return ApiResponse.success(res, result.roles, "Roles fetched successfully", 200, result.meta);
  }),

  // GET /api/v1/roles/public
  getPublicRoles: asyncHandler(async (req, res) => {
    const result = await roleService.getPublicRoles(req.query);
    return ApiResponse.success(res, result, "Public roles fetched successfully");
  }),

  // POST /api/v1/roles
  createRole: asyncHandler(async (req, res) => {
    const role = await roleService.createRole(req.body, req.user);
    return ApiResponse.created(res, role, "Role assigned successfully");
  }),

  // PUT /api/v1/roles/:id
  updateRole: asyncHandler(async (req, res) => {
    const role = await roleService.updateRole(req.params.id, req.body, req.user);
    return ApiResponse.success(res, role, "Role updated successfully");
  }),

  // DELETE /api/v1/roles/:id
  deleteRole: asyncHandler(async (req, res) => {
    await roleService.deleteRole(req.params.id, req.user);
    return ApiResponse.success(res, null, "Role removed successfully");
  }),
};
