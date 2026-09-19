import { followupService } from "./followup.service.js";
import { Followup } from "./followup.model.js";

export const followupController = {
  async getFollowups(req, res, next) {
    try {
      const { type, status, eventId, chapter, search } = req.query;
      const effectiveChapter = chapter || req.user?.chapter;
      const data = await followupService.getFollowups({
        type,
        status,
        eventId,
        chapter: effectiveChapter,
        search,
        user: req.user,
      });
      res.json({ success: true, data });
    } catch (err) {
      next(err);
    }
  },

  async getStats(req, res, next) {
    try {
      const { chapter, eventId } = req.query;
      const effectiveChapter = chapter || req.user?.chapter;
      const stats = await followupService.getStats(effectiveChapter, eventId, req.user);
      res.json({ success: true, data: stats });
    } catch (err) {
      next(err);
    }
  },

  async syncEvent(req, res, next) {
    try {
      const { eventId } = req.params;
      const result = await followupService.syncFromEvent(eventId);
      res.json({ success: true, message: `Synced ${result.syncedCount} participants`, data: result });
    } catch (err) {
      next(err);
    }
  },

  async syncMembers(req, res, next) {
    try {
      const { chapter } = req.body;
      const effectiveChapter = chapter || req.user?.chapter;
      if (!effectiveChapter) throw new Error("Chapter is required for member sync");
      const result = await followupService.syncFromMembers(effectiveChapter);
      res.json({ success: true, message: `Synced ${result.syncedCount} members and prospects`, data: result });
    } catch (err) {
      next(err);
    }
  },

  async updateStatus(req, res, next) {
    try {
      const { id } = req.params;
      const { status, note } = req.body;
      const author = req.user?.name || "Admin";
      const updated = await followupService.updateStatus(id, status, note, author);
      res.json({ success: true, data: updated });
    } catch (err) {
      next(err);
    }
  },

  async addNote(req, res, next) {
    try {
      const { id } = req.params;
      const { content } = req.body;
      const author = req.user?.name || "Admin";
      const updated = await followupService.addNote(id, content, author);
      res.json({ success: true, data: updated });
    } catch (err) {
      next(err);
    }
  },

  async logMessage(req, res, next) {
    try {
      const { id } = req.params;
      const { channel, message } = req.body;
      const updated = await followupService.logMessage(id, { channel, message });
      res.json({ success: true, data: updated });
    } catch (err) {
      next(err);
    }
  },

  async create(req, res, next) {
    try {
      const payload = { ...req.body };
      if (!payload.chapter && req.user?.chapter) {
        payload.chapter = req.user.chapter;
      }
      const created = await Followup.create(payload);
      res.status(201).json({ success: true, data: created });
    } catch (err) {
      next(err);
    }
  },

  async addHistory(req, res, next) {
    try {
      const { id } = req.params;
      const { method, message, notes, status, nextFollowUpAt } = req.body;
      const contactedBy = req.user?.name || "Admin";
      const updated = await followupService.addHistory(id, {
        contactedBy,
        method,
        message,
        notes,
        status,
        nextFollowUpAt,
      });
      res.json({ success: true, data: updated });
    } catch (err) {
      next(err);
    }
  },

  async deleteFollowup(req, res, next) {
    try {
      const { id } = req.params;
      const deleted = await followupService.deleteFollowup(id);
      res.json({ success: true, message: "Followup deleted successfully", data: deleted });
    } catch (err) {
      next(err);
    }
  },
};
