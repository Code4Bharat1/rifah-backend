import { announcementService } from "./announcement.service.js";
import { asyncHandler } from "../../shared/utils/async-handler.js";

/**
 * Helper to determine the strictly enforced chapter based on user role.
 * Super Admin/Secretariat can potentially view all (or be constrained if we want, but for now we enforce if chapter_admin).
 */
const getEnforcedChapter = (user) => {
  if (user.role === "chapter_admin") {
    return user.chapter; // e.g. "Mumbai Chapter"
  }
  return null; // Super Admin can see all, or filter by query (handled separately)
};

export const announcementController = {
  /**
   * Create an announcement.
   * Forces chapter to req.user.chapter for chapter_admin.
   */
  create: asyncHandler(async (req, res) => {
    const enforcedChapter = getEnforcedChapter(req.user);
    
    const announcementData = {
      ...req.body,
      author: req.user.id,
      // If chapter_admin, FORCE their chapter. If super_admin, allow them to specify or default.
      chapter: enforcedChapter || req.body.chapter, 
    };

    if (!announcementData.chapter) {
      return res.status(400).json({ success: false, message: "Chapter is required" });
    }

    const result = await announcementService.createAnnouncement(announcementData);
    res.status(201).json({ success: true, data: result });
  }),

  /**
   * List announcements.
   * Forces filter to req.user.chapter for chapter_admin.
   */
  list: asyncHandler(async (req, res) => {
    let chapterToQuery = getEnforcedChapter(req.user);

    // If super admin, they can optionally filter by query
    if (!chapterToQuery && req.query.chapter) {
      chapterToQuery = req.query.chapter;
    }

    const results = await announcementService.listAnnouncements(chapterToQuery);
    res.json({ success: true, data: results });
  }),

  /**
   * Get single announcement.
   */
  getById: asyncHandler(async (req, res) => {
    const enforcedChapter = getEnforcedChapter(req.user);
    const result = await announcementService.getAnnouncement(req.params.id, enforcedChapter);
    res.json({ success: true, data: result });
  }),

  /**
   * Update announcement.
   */
  update: asyncHandler(async (req, res) => {
    const enforcedChapter = getEnforcedChapter(req.user);
    const updateData = { ...req.body };
    
    // Do not allow changing chapter or author
    delete updateData.chapter;
    delete updateData.author;
    delete updateData.broadcastId;

    const result = await announcementService.updateAnnouncement(req.params.id, enforcedChapter, updateData);
    res.json({ success: true, data: result });
  }),

  /**
   * Delete announcement.
   */
  delete: asyncHandler(async (req, res) => {
    const enforcedChapter = getEnforcedChapter(req.user);
    await announcementService.deleteAnnouncement(req.params.id, enforcedChapter);
    res.json({ success: true, message: "Announcement deleted successfully" });
  })
};
