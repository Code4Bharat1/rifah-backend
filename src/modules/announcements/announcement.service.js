import { Announcement } from "./announcement.model.js";
import { notificationService } from "../notifications/notification.service.js";
import { NotFoundError, ValidationError } from "../../shared/errors/errors.js";
import { getChapterFilter } from "../../shared/utils/chapter-scope.js";

export const announcementService = {
  createAnnouncement: async (data) => {
    const announcement = new Announcement(data);
    
    if (announcement.status === "Published") {
      announcement.publishedAt = new Date();
      const broadcastResult = await notificationService.broadcastNotification({
        type: "Announcement",
        title: announcement.title,
        body: announcement.message,
        chapter: announcement.chapter,
        link: "/me/notifications",
      });
      announcement.broadcastId = broadcastResult.broadcastId;
    }
    
    await announcement.save();
    return announcement;
  },

  listAnnouncements: async (queryParams, user) => {
    const filter = {};
    const chapterScope = await getChapterFilter(user, 'direct');
    Object.assign(filter, chapterScope);

    if (queryParams && queryParams.chapter && !chapterScope.chapter) {
      filter.chapter = queryParams.chapter;
    }
    
    return Announcement.find(filter).sort({ createdAt: -1 }).populate("author", "name email");
  },

  getAnnouncement: async (id, user) => {
    const chapterScope = await getChapterFilter(user, 'direct');
    const filter = { _id: id, ...chapterScope };
    
    const announcement = await Announcement.findOne(filter).populate("author", "name email");
    if (!announcement) {
      throw new NotFoundError("Announcement not found or access denied");
    }
    return announcement;
  },

  updateAnnouncement: async (id, updateData, user) => {
    const chapterScope = await getChapterFilter(user, 'direct');
    const filter = { _id: id, ...chapterScope };

    const announcement = await Announcement.findOne(filter);
    if (!announcement) {
      throw new NotFoundError("Announcement not found or access denied");
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

  deleteAnnouncement: async (id, user) => {
    const chapterScope = await getChapterFilter(user, 'direct');
    const filter = { _id: id, ...chapterScope };

    const announcement = await Announcement.findOne(filter);
    if (!announcement) {
      throw new NotFoundError("Announcement not found or access denied");
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
