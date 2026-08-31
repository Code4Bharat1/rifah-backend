import { Notification } from "./notification.model.js";
import { User } from "../users/user.model.js";
import { parsePagination, buildPaginationMeta } from "../../shared/utils/pagination.js";
import { NotFoundError } from "../../shared/errors/errors.js";

export const notificationService = {
  /**
   * Create an in-app notification
   */
  createNotification: async ({ recipientId, type, title, body, entityId, link }) => {
    return Notification.create({
      recipient: recipientId,
      type: type || "System",
      title,
      body,
      entityId: entityId || "",
      link: link || "",
    });
  },

  /**
   * Broadcast a notification to all active users or members of a chapter
   */
  broadcastNotification: async ({ type, title, body, chapter, link }) => {
    const query = { status: "Active" };
    if (chapter) query.chapter = chapter;

    const users = await User.find(query).select("_id");
    const notifications = users.map((u) => ({
      recipient: u._id,
      type: type || "System",
      title,
      body,
      link: link || "",
    }));

    if (notifications.length > 0) {
      await Notification.insertMany(notifications);
    }

    return { sentCount: notifications.length };
  },

  /**
   * List notifications for current user
   */
  listUserNotifications: async (userId, queryParams = {}) => {
    const { page, limit, skip, sort } = parsePagination(queryParams);
    const filter = { recipient: userId };

    if (queryParams.unreadOnly === "true") {
      filter.isRead = false;
    }

    const [notifications, total, unreadCount] = await Promise.all([
      Notification.find(filter).sort(sort).skip(skip).limit(limit),
      Notification.countDocuments(filter),
      Notification.countDocuments({ recipient: userId, isRead: false }),
    ]);

    return {
      notifications,
      unreadCount,
      meta: buildPaginationMeta(total, page, limit),
    };
  },

  /**
   * Mark single notification as read
   */
  markAsRead: async (notificationId, userId) => {
    const notification = await Notification.findOneAndUpdate(
      { _id: notificationId, recipient: userId },
      { isRead: true, readAt: new Date() },
      { new: true }
    );
    if (!notification) {
      throw new NotFoundError("Notification not found");
    }
    return notification;
  },

  /**
   * Mark all notifications as read for current user
   */
  markAllAsRead: async (userId) => {
    await Notification.updateMany(
      { recipient: userId, isRead: false },
      { isRead: true, readAt: new Date() }
    );
    return true;
  },
};
