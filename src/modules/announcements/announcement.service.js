import { Announcement } from "./announcement.model.js";
import { notificationService } from "../notifications/notification.service.js";
import { NotFoundError, ValidationError } from "../../shared/errors/errors.js";

export const announcementService = {
  createAnnouncement: async (data) => {
    return Announcement.create(data);
  },

  listAnnouncements: async (chapter) => {
    const filter = chapter ? { chapter } : {};
    return Announcement.find(filter).sort({ createdAt: -1 }).populate("author", "name email");
  },

  getAnnouncement: async (id, chapter) => {
    const filter = { _id: id };
    if (chapter) filter.chapter = chapter;
    
    const announcement = await Announcement.findOne(filter).populate("author", "name email");
    if (!announcement) {
      throw new NotFoundError("Announcement not found");
    }
    return announcement;
  },

  updateAnnouncement: async (id, chapter, updateData) => {
    const filter = { _id: id };
    if (chapter) filter.chapter = chapter;

    const announcement = await Announcement.findOne(filter);
    if (!announcement) {
      throw new NotFoundError("Announcement not found");
    }

    if (announcement.status === "Published" && updateData.status === "Draft") {
       throw new ValidationError("Cannot revert a published announcement back to draft");
    }

    const wasDraft = announcement.status === "Draft";
    const isNowPublished = updateData.status === "Published";

    Object.assign(announcement, updateData);

    // If we are publishing for the first time
    if (wasDraft && isNowPublished) {
      announcement.publishedAt = new Date();
      // Broadcast via notification service
      const broadcastResult = await notificationService.broadcastNotification({
        type: "Announcement",
        title: announcement.title,
        body: announcement.message,
        chapter: announcement.chapter,
        link: "/me/notifications", // A general place where members view things
      });
      announcement.broadcastId = broadcastResult.broadcastId;
    }

    await announcement.save();
    return announcement;
  },

  deleteAnnouncement: async (id, chapter) => {
    const filter = { _id: id };
    if (chapter) filter.chapter = chapter;

    const announcement = await Announcement.findOne(filter);
    if (!announcement) {
      throw new NotFoundError("Announcement not found");
    }

    if (announcement.broadcastId) {
      // Recall the broadcast if it was published
      try {
        await notificationService.deleteBroadcast(announcement.broadcastId);
      } catch (err) {
        console.error(`Failed to recall broadcast for announcement ${id}`, err);
      }
    }

    await announcement.deleteOne();
    return true;
  }
};
