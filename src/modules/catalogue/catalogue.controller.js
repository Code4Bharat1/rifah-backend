import { Catalogue } from "./catalogue.model.js";
import { catalogueService } from "./catalogue.service.js";
import { asyncHandler } from "../../shared/utils/async-handler.js";
import { ApiResponse } from "../../shared/utils/response.js";
import { storageService } from "../../infrastructure/storage/storage.service.js";

export const catalogueController = {
  searchCatalogue: asyncHandler(async (req, res) => {
    const { items, meta } = await catalogueService.searchCatalogue(req.query);
    return ApiResponse.success(res, items, "Catalogue items retrieved", 200, meta);
  }),

  listByBusiness: asyncHandler(async (req, res) => {
    const { businessId } = req.params;
    const items = await catalogueService.listByBusiness(businessId);
    return ApiResponse.success(res, items, "Business catalogue items retrieved");
  }),

  createItem: asyncHandler(async (req, res) => {
    const item = await catalogueService.createItem(req.body, req.user);
    return ApiResponse.created(res, item, "Catalogue item created successfully");
  }),

  updateItem: asyncHandler(async (req, res) => {
    const { id } = req.params;
    const updated = await catalogueService.updateItem(id, req.body, req.user);
    return ApiResponse.success(res, updated, "Catalogue item updated successfully");
  }),

  uploadItemImages: asyncHandler(async (req, res) => {
    const { id } = req.params;
    if (!req.files || req.files.length === 0) {
      return ApiResponse.error(res, "No image files uploaded", 400);
    }
    const newImageUrls = req.files.map((f) => storageService.getPublicUrl(f.filename, "catalogue"));
    const existingItem = await Catalogue.findById(id);
    const currentImages = Array.isArray(existingItem?.images) ? existingItem.images : [];
    const combinedImages = [...currentImages, ...newImageUrls];
    const updated = await catalogueService.updateItem(id, { images: combinedImages }, req.user);
    return ApiResponse.success(res, { images: combinedImages, item: updated }, "Images uploaded successfully");
  }),

  deleteItem: asyncHandler(async (req, res) => {
    const { id } = req.params;
    await catalogueService.deleteItem(id, req.user);
    return ApiResponse.success(res, null, "Catalogue item deleted successfully");
  }),
};
