import { categoryService } from "./category.service.js";
import { asyncHandler } from "../../shared/utils/async-handler.js";
import { ApiResponse } from "../../shared/utils/response.js";

export const categoryController = {
  listCategories: asyncHandler(async (req, res) => {
    const categories = await categoryService.listCategories(req.query);
    return ApiResponse.success(res, categories, "Categories retrieved");
  }),

  getCategoryBySlug: asyncHandler(async (req, res) => {
    const { slug } = req.params;
    const category = await categoryService.getCategoryBySlug(slug);
    return ApiResponse.success(res, category, "Category retrieved");
  }),

  createCategory: asyncHandler(async (req, res) => {
    const created = await categoryService.createCategory(req.body);
    return ApiResponse.created(res, created, "Category created successfully");
  }),

  updateCategory: asyncHandler(async (req, res) => {
    const { id } = req.params;
    const updated = await categoryService.updateCategory(id, req.body);
    return ApiResponse.success(res, updated, "Category updated successfully");
  }),

  deleteCategory: asyncHandler(async (req, res) => {
    const { id } = req.params;
    await categoryService.deleteCategory(id);
    return ApiResponse.success(res, null, "Category deleted successfully");
  }),
};
