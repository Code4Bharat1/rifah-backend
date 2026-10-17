import { notificationService } from "./notification.service.js";
import { asyncHandler } from "../../shared/utils/async-handler.js";
import { ApiResponse } from "../../shared/utils/response.js";
import { whatsappService } from "../../infrastructure/whatsapp/whatsapp.service.js";
import cluster from "node:cluster";

export const notificationController = {
  getWhatsAppStatus: asyncHandler(async (req, res) => {
    const status = whatsappService.getStatus();
    return ApiResponse.success(res, { ...status, pid: process.pid, workerId: cluster?.worker?.id || null }, "WhatsApp client status retrieved");
  }),

  getWhatsAppQR: asyncHandler(async (req, res) => {
    const status = whatsappService.getStatus();
    if (status.isConnected) {
      return ApiResponse.success(res, { isConnected: true, message: "WhatsApp is already connected!" }, "Already connected");
    }
    return ApiResponse.success(res, { qrCodeDataUrl: status.qrCodeDataUrl, status: status.status }, "WhatsApp QR retrieved");
  }),

  restartWhatsApp: asyncHandler(async (req, res) => {
    whatsappService.reconnect().catch((err) => {
      console.error("[WHATSAPP RESTART ERROR]:", err?.message || err);
    });
    await new Promise((r) => setTimeout(r, 2000));
    const status = whatsappService.getStatus();
    return ApiResponse.success(res, status, "WhatsApp reconnection started");
  }),

  debugWhatsApp: asyncHandler(async (req, res) => {
    const debug = await whatsappService.getDebugState();
    return ApiResponse.success(res, debug, "WhatsApp Debug Info");
  }),

  forceReadyWhatsApp: asyncHandler(async (req, res) => {
    const result = await whatsappService.forceReady();
    return ApiResponse.success(res, result, "Force ready triggered");
  }),

  testWhatsApp: asyncHandler(async (req, res) => {
    const targetPhone = req.body?.phone || req.query?.phone || req.user?.phone;
    if (!targetPhone) {
      return ApiResponse.error(res, "Please provide a recipient phone number (e.g. ?phone=919876543210)", 400);
    }
    let status = whatsappService.getStatus();

    // Auto-attempt init/reconnect if status is in error or not initialized
    if (status.status === "ERROR" || status.status === "NOT_INITIALIZED" || status.status === "DISCONNECTED") {
      whatsappService.reconnect().catch(() => {});
      // Wait up to 3 seconds to see if it starts
      await new Promise((r) => setTimeout(r, 2000));
      status = whatsappService.getStatus();
    }

    if (!status.isConnected) {
      return ApiResponse.success(
        res,
        { isConnected: false, status: status.status, lastError: status.lastError },
        `WhatsApp Web client is not connected (current status: '${status.status}'). Error: ${status.lastError || "None"}. Please visit /admin/whatsapp or scan QR code.`
      );
    }
    const sent = await whatsappService.sendTestMessage(targetPhone);
    if (sent) {
      return ApiResponse.success(res, { phone: targetPhone, status: status.status }, "WhatsApp test message sent successfully!");
    } else {
      const refreshedStatus = whatsappService.getStatus();
      return ApiResponse.success(
        res,
        { sent: false, phone: targetPhone, status: refreshedStatus.status, lastError: refreshedStatus.lastError },
        "Failed to send WhatsApp message. Please check server logs or admin panel."
      );
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
