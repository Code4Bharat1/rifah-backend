import { announcementService } from "./announcement.service.js";
import { asyncHandler } from "../../shared/utils/async-handler.js";
import { auditService } from "../audit/audit.service.js";



export const announcementController = {
  /**
   * Create an announcement.
   * Forces chapter to req.user.chapter for chapter_admin.
   */
  create: asyncHandler(async (req, res) => {
    const announcementData = {
      ...req.body,
      author: req.user.id,
    };
    if (req.user.role === "chapter_admin" && req.user.chapter) {
      announcementData.chapter = req.user.chapter;
    }

    if (!announcementData.chapter) {
      return res.status(400).json({ success: false, message: "Chapter is required" });
    }

    const result = await announcementService.createAnnouncement(announcementData);
    
    await auditService.logAction({
      actor: req.user,
      action: "CREATE",
      targetModel: "Announcement",
      targetId: result._id,
      summary: `Created new announcement: ${result.title}`,
      ipAddress: req.ip
    });
    
    res.status(201).json({ success: true, data: result });
  }),

  /**
   * List announcements.
   * Forces filter to req.user.chapter for chapter_admin.
   */
  list: asyncHandler(async (req, res) => {
    const results = await announcementService.listAnnouncements(req.query, req.user);
    res.json({ success: true, data: results });
  }),

  /**
   * Get single announcement.
   */
  getById: asyncHandler(async (req, res) => {
    const result = await announcementService.getAnnouncement(req.params.id, req.user);
    res.json({ success: true, data: result });
  }),

  /**
   * Update announcement.
   */
  update: asyncHandler(async (req, res) => {
    const updateData = { ...req.body };
    
    // Do not allow changing chapter or author
    delete updateData.chapter;
    delete updateData.author;
    delete updateData.broadcastId;

    const result = await announcementService.updateAnnouncement(req.params.id, updateData, req.user);
    
    await auditService.logAction({
      actor: req.user,
      action: "UPDATE",
      targetModel: "Announcement",
      targetId: result._id,
      summary: `Updated announcement: ${result.title}`,
      ipAddress: req.ip
    });

    res.json({ success: true, data: result });
  }),

  /**
   * Delete announcement.
   */
  delete: asyncHandler(async (req, res) => {
    const announcement = await announcementService.getAnnouncement(req.params.id, req.user);
    await announcementService.deleteAnnouncement(req.params.id, req.user);
    
    await auditService.logAction({
      actor: req.user,
      action: "DELETE",
      targetModel: "Announcement",
      targetId: req.params.id,
      summary: `Deleted announcement: ${announcement?.title || req.params.id}`,
      ipAddress: req.ip
    });

    res.json({ success: true, message: "Announcement deleted successfully" });
  })
};
