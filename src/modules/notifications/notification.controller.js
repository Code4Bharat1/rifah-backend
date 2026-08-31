import { notificationService } from "./notification.service.js";
import { asyncHandler } from "../../shared/utils/async-handler.js";
import { ApiResponse } from "../../shared/utils/response.js";

export const notificationController = {
  getMyNotifications: asyncHandler(async (req, res) => {
    const { notifications, unreadCount, meta } =
      await notificationService.listUserNotifications(req.user.id, req.query);
    return ApiResponse.success(
      res,
      { notifications, unreadCount },
      "Notifications retrieved",
      200,
      meta
    );
  }),

  markAsRead: asyncHandler(async (req, res) => {
    const { id } = req.params;
    const notification = await notificationService.markAsRead(id, req.user.id);
    return ApiResponse.success(res, notification, "Notification marked as read");
  }),

  markAllAsRead: asyncHandler(async (req, res) => {
    await notificationService.markAllAsRead(req.user.id);
    return ApiResponse.success(res, null, "All notifications marked as read");
  }),

  broadcast: asyncHandler(async (req, res) => {
    const result = await notificationService.broadcastNotification(req.body);
    return ApiResponse.success(res, result, `Broadcast sent to ${result.sentCount} recipients`);
  }),
};
