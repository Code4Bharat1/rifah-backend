import { rolePermissionTemplateService } from "./role-permission-template.service.js";
import { ApiResponse } from "../../shared/utils/response.js";
import { asyncHandler } from "../../shared/utils/async-handler.js";

export const rolePermissionTemplateController = {
  // GET /api/v1/role-permission-templates
  list: asyncHandler(async (req, res) => {
    const templates = await rolePermissionTemplateService.list(req.user);
    return ApiResponse.success(res, templates, "Permission templates fetched successfully");
  }),

  // GET /api/v1/role-permission-templates/:id
  getById: asyncHandler(async (req, res) => {
    const tpl = await rolePermissionTemplateService.getById(req.params.id, req.user);
    return ApiResponse.success(res, tpl, "Permission template fetched successfully");
  }),

  // POST /api/v1/role-permission-templates
  create: asyncHandler(async (req, res) => {
    const tpl = await rolePermissionTemplateService.create(req.body, req.user);
    return ApiResponse.created(res, tpl, "Permission template created successfully");
  }),

  // PUT /api/v1/role-permission-templates/:id
  update: asyncHandler(async (req, res) => {
    const tpl = await rolePermissionTemplateService.update(req.params.id, req.body, req.user);
    return ApiResponse.success(res, tpl, "Permission template updated successfully");
  }),

  // DELETE /api/v1/role-permission-templates/:id
  delete: asyncHandler(async (req, res) => {
    const result = await rolePermissionTemplateService.delete(req.params.id, req.user);
    return ApiResponse.success(res, null, result.message);
  }),
};
