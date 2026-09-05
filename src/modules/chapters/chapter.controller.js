import { chapterService } from "./chapter.service.js";
import { asyncHandler } from "../../shared/utils/async-handler.js";
import { ApiResponse } from "../../shared/utils/response.js";

export const chapterController = {
  listChapters: asyncHandler(async (req, res) => {
    const chapters = await chapterService.listChapters(req.query, req.user);
    return ApiResponse.success(res, chapters, "Chapters retrieved");
  }),

  getChapterBySlug: asyncHandler(async (req, res) => {
    const { slug } = req.params;
    const chapter = await chapterService.getChapterBySlug(slug);
    return ApiResponse.success(res, chapter, "Chapter retrieved");
  }),

  getChapterById: asyncHandler(async (req, res) => {
    const { id } = req.params;
    const chapter = await chapterService.getChapterById(id);
    return ApiResponse.success(res, chapter, "Chapter retrieved");
  }),

  getChapterDetails: asyncHandler(async (req, res) => {
    const { id } = req.params;
    const details = await chapterService.getChapterDetails(id);
    return ApiResponse.success(res, details, "Chapter details retrieved");
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

  assignAdmin: asyncHandler(async (req, res) => {
    const { id } = req.params;
    const admin = await chapterService.assignAdmin(id, req.body);
    return ApiResponse.created(res, admin, "Chapter Admin created and invitation sent");
  }),

  updateChapterStatus: asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { status } = req.body;
    const updated = await chapterService.updateChapterStatus(id, status);
    return ApiResponse.success(res, updated, "Chapter status updated successfully");
  }),
};
