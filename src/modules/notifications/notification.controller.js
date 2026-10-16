import { notificationService } from "./notification.service.js";
import { asyncHandler } from "../../shared/utils/async-handler.js";
import { ApiResponse } from "../../shared/utils/response.js";
import { whatsappService } from "../../infrastructure/whatsapp/whatsapp.service.js";

export const notificationController = {
  testWhatsApp: asyncHandler(async (req, res) => {
    const { phone } = req.body;
    const targetPhone = phone || req.user?.phone;
    if (!targetPhone) {
      return ApiResponse.error(res, "Please provide a recipient phone number (e.g. 919876543210)", 400);
    }
    const sent = await whatsappService.sendTestHelloWorld(targetPhone);
    if (sent) {
      return ApiResponse.success(res, { phone: targetPhone }, "WhatsApp test message sent successfully!");
    } else {
      return ApiResponse.error(res, "Failed to send WhatsApp message. Ensure the phone number is added to your Meta test recipient list.", 500);
    }
  }),
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

  deleteBroadcast: asyncHandler(async (req, res) => {
    const { broadcastId } = req.params;
    const result = await notificationService.deleteBroadcast(broadcastId);
    return ApiResponse.success(res, result, `Successfully recalled broadcast from ${result.deletedCount} users`);
  }),

  deleteNotification: asyncHandler(async (req, res) => {
    const { id } = req.params;
    const result = await notificationService.deleteNotification(id, req.user.id);
    return ApiResponse.success(res, result, "Notification deleted");
  }),

  clearAllNotifications: asyncHandler(async (req, res) => {
    const result = await notificationService.clearAllNotifications(req.user.id);
    return ApiResponse.success(res, null, `Cleared ${result.deletedCount} notifications`);
  }),
};
