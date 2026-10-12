import { dignitaryService } from "./dignitary.service.js";
import { asyncHandler } from "../../shared/utils/async-handler.js";
import { ApiResponse } from "../../shared/utils/response.js";

export const dignitaryController = {
  getAll: asyncHandler(async (req, res) => {
    const data = await dignitaryService.getAll(req.query);
    return ApiResponse.success(res, data, "Dignitaries retrieved successfully");
  }),

  getById: asyncHandler(async (req, res) => {
    const data = await dignitaryService.getById(req.params.id);
    return ApiResponse.success(res, data, "Dignitary retrieved successfully");
  }),

  create: asyncHandler(async (req, res) => {
    const data = await dignitaryService.create(req.body, req.user);
    return ApiResponse.created(res, data, "Dignitary created successfully");
  }),

  update: asyncHandler(async (req, res) => {
    const data = await dignitaryService.update(req.params.id, req.body);
    return ApiResponse.success(res, data, "Dignitary updated successfully");
  }),

  delete: asyncHandler(async (req, res) => {
    const result = await dignitaryService.delete(req.params.id);
    return ApiResponse.success(res, result, "Dignitary deleted successfully");
  }),
};
