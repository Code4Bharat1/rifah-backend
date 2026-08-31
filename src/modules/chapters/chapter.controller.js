import { chapterService } from "./chapter.service.js";
import { asyncHandler } from "../../shared/utils/async-handler.js";
import { ApiResponse } from "../../shared/utils/response.js";

export const chapterController = {
  listChapters: asyncHandler(async (req, res) => {
    const chapters = await chapterService.listChapters(req.query);
    return ApiResponse.success(res, chapters, "Chapters retrieved");
  }),

  getChapterBySlug: asyncHandler(async (req, res) => {
    const { slug } = req.params;
    const chapter = await chapterService.getChapterBySlug(slug);
    return ApiResponse.success(res, chapter, "Chapter retrieved");
  }),

  createChapter: asyncHandler(async (req, res) => {
    const created = await chapterService.createChapter(req.body);
    return ApiResponse.created(res, created, "Chapter created successfully");
  }),

  updateChapter: asyncHandler(async (req, res) => {
    const { id } = req.params;
    const updated = await chapterService.updateChapter(id, req.body);
    return ApiResponse.success(res, updated, "Chapter updated successfully");
  }),

  addUnit: asyncHandler(async (req, res) => {
    const { id } = req.params;
    const updated = await chapterService.addUnit(id, req.body);
    return ApiResponse.success(res, updated, "Unit added to chapter successfully");
  }),

  removeUnit: asyncHandler(async (req, res) => {
    const { id, unitId } = req.params;
    const updated = await chapterService.removeUnit(id, unitId);
    return ApiResponse.success(res, updated, "Unit removed from chapter successfully");
  }),
};
