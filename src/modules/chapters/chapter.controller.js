import { chapterService } from "./chapter.service.js";
import { asyncHandler } from "../../shared/utils/async-handler.js";
import { ApiResponse } from "../../shared/utils/response.js";

import { auditService } from "../audit/audit.service.js";

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
    const details = await chapterService.getChapterDetails(id, req.user);
    return ApiResponse.success(res, details, "Chapter details retrieved");
  }),

  createChapter: asyncHandler(async (req, res) => {
    const created = await chapterService.createChapter(req.body);
    await auditService.logAction({
      actor: req.user,
      action: "CREATE",
      targetModel: "Chapter",
      targetId: created._id,
      summary: `Created new chapter: ${created.name}`,
      ipAddress: req.ip
    });
    return ApiResponse.created(res, created, "Chapter created successfully");
  }),

  updateChapter: asyncHandler(async (req, res) => {
    const { id } = req.params;
    const updated = await chapterService.updateChapter(id, req.body);
    await auditService.logAction({
      actor: req.user,
      action: "UPDATE",
      targetModel: "Chapter",
      targetId: updated._id,
      summary: `Updated chapter: ${updated.name}`,
      ipAddress: req.ip
    });
    return ApiResponse.success(res, updated, "Chapter updated successfully");
  }),

  addUnit: asyncHandler(async (req, res) => {
    const { id } = req.params;
    const updated = await chapterService.addUnit(id, req.body);
    await auditService.logAction({
      actor: req.user,
      action: "UPDATE",
      targetModel: "Chapter",
      targetId: id,
      summary: `Added unit ${req.body.name} to chapter`,
      ipAddress: req.ip
    });
    return ApiResponse.success(res, updated, "Unit added to chapter successfully");
  }),

  removeUnit: asyncHandler(async (req, res) => {
    const { id, unitId } = req.params;
    const updated = await chapterService.removeUnit(id, unitId);
    await auditService.logAction({
      actor: req.user,
      action: "UPDATE",
      targetModel: "Chapter",
      targetId: id,
      summary: `Removed unit ${unitId} from chapter`,
      ipAddress: req.ip
    });
    return ApiResponse.success(res, updated, "Unit removed from chapter successfully");
  }),

  assignAdmin: asyncHandler(async (req, res) => {
    const { id } = req.params;
    const admin = await chapterService.assignAdmin(id, req.body);
    await auditService.logAction({
      actor: req.user,
      action: "CREATE",
      targetModel: "User",
      targetId: admin._id,
      summary: `Assigned admin ${admin.name} to chapter ${id}`,
      ipAddress: req.ip
    });
    return ApiResponse.created(res, admin, "Chapter Admin created and invitation sent");
  }),

  updateChapterStatus: asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { status } = req.body;
    const updated = await chapterService.updateChapterStatus(id, status);
    return ApiResponse.success(res, updated, "Chapter status updated successfully");
  }),
};
