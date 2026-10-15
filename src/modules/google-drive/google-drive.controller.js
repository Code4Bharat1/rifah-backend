import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import { asyncHandler } from "../../shared/utils/async-handler.js";
import { ApiResponse } from "../../shared/utils/response.js";
import { googleDriveService } from "../../infrastructure/google/google-drive.service.js";
import { googleDriveSyncService } from "./google-drive-sync.service.js";
import { GoogleDriveSettings } from "./google-drive-settings.model.js";
import { GoogleDriveSyncLog } from "./google-drive-sync-log.model.js";
import { auditService } from "../audit/audit.service.js";
import { env } from "../../config/env.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const CACHE_DIR = path.resolve(__dirname, `../../../${env.STORAGE.UPLOAD_DIR}/google-drive-cache`);

export const googleDriveController = {
  /**
   * Retrieves Google Drive integration status, folder info, file metadata, and metrics
   */
  getStatus: asyncHandler(async (req, res) => {
    const settings = await googleDriveSyncService.getSettings();

    // Query recent logs
    const recentLogs = await GoogleDriveSyncLog.find({})
      .sort({ createdAt: -1 })
      .limit(10)
      .populate("triggeredBy", "name email role")
      .lean();

    const failedCount = await GoogleDriveSyncLog.countDocuments({ status: "failed" });

    return ApiResponse.success(
      res,
      {
        isConnected: settings.isConnected,
        googleEmail: settings.googleEmail,
        googleDisplayName: settings.googleDisplayName,
        googleAvatar: settings.googleAvatar,
        folderId: settings.folderId,
        folderName: settings.folderName,
        folderWebViewLink: settings.folderWebViewLink,
        fileLinks: settings.fileLinks || {},
        syncedAdminsCount: settings.syncedAdmins?.length || 0,
        syncedAdmins: settings.syncedAdmins || [],
        autoSyncEnabled: settings.autoSyncEnabled,
        lastFullSyncAt: settings.lastFullSyncAt,
        failedCount,
        recentLogs,
      },
      "Google Drive integration status retrieved"
    );
  }),

  /**
   * Generates Google OAuth authorization URL for Central Admin
   */
  getAuthUrl: asyncHandler(async (req, res) => {
    const authUrl = googleDriveService.getAuthUrl("rifah-admin-connect");
    return ApiResponse.success(res, { authUrl }, "Google Drive auth URL generated");
  }),

  /**
   * Handles Google OAuth redirect callback
   */
  handleOAuthCallback: asyncHandler(async (req, res) => {
    const { code, error } = req.query;

    if (error) {
      console.warn("[GoogleDriveController] OAuth callback error:", error);
      return res.redirect(`${env.FRONTEND_URL}/admin/google-drive?error=${encodeURIComponent(error)}`);
    }

    if (!code) {
      return res.redirect(`${env.FRONTEND_URL}/admin/google-drive?error=missing_code`);
    }

    try {
      const { tokens, userInfo } = await googleDriveService.exchangeCodeForTokens(code);

      const settings = await googleDriveSyncService.getSettings(true);
      settings.isConnected = true;
      if (tokens.refresh_token) {
        settings.refreshToken = tokens.refresh_token;
      }
      if (tokens.access_token) {
        settings.accessToken = tokens.access_token;
      }
      if (tokens.expiry_date) {
        settings.tokenExpiry = new Date(tokens.expiry_date);
      }
      if (userInfo) {
        settings.googleEmail = userInfo.email || settings.googleEmail;
        settings.googleDisplayName = userInfo.name || settings.googleDisplayName;
        settings.googleAvatar = userInfo.picture || settings.googleAvatar;
      }

      // Ensure Central Shared Folder is initialized
      const folder = await googleDriveService.ensureSharedFolder({
        folderId: settings.folderId,
        folderName: settings.folderName,
        refreshToken: settings.refreshToken,
      });

      settings.folderId = folder.folderId;
      settings.folderName = folder.folderName;
      settings.folderWebViewLink = folder.webViewLink;
      await settings.save();

      // Trigger initial permission reconciliation and full sync in background
      googleDriveSyncService.reconcileAdminPermissions().catch(() => {});
      googleDriveSyncService.fullSyncAll().catch(() => {});

      await auditService.logAction({
        actor: req.user || { name: "Central Admin", role: "central_admin" },
        action: "GOOGLE_DRIVE_CONNECT",
        targetModel: "GoogleDriveSettings",
        targetId: settings._id,
        summary: `Connected platform Google Drive folder to ${settings.googleEmail}`,
        ipAddress: req.ip,
      });

      return res.redirect(`${env.FRONTEND_URL}/admin/google-drive?connected=1`);
    } catch (err) {
      console.error("[GoogleDriveController] OAuth token exchange error:", err);
      return res.redirect(`${env.FRONTEND_URL}/admin/google-drive?error=${encodeURIComponent(err.message)}`);
    }
  }),

  /**
   * Disconnects Google Drive
   */
  disconnect: asyncHandler(async (req, res) => {
    const settings = await googleDriveSyncService.getSettings(true);
    settings.isConnected = false;
    settings.refreshToken = "";
    settings.accessToken = "";
    await settings.save();

    await auditService.logAction({
      actor: req.user,
      action: "GOOGLE_DRIVE_DISCONNECT",
      targetModel: "GoogleDriveSettings",
      targetId: settings._id,
      summary: "Disconnected platform Google Drive account",
      ipAddress: req.ip,
    });

    return ApiResponse.success(res, null, "Google Drive account disconnected successfully");
  }),

  /**
   * Triggers manual synchronization of a spreadsheet or all spreadsheets
   */
  triggerSync: asyncHandler(async (req, res) => {
    const { target = "all" } = req.body;

    const result = await googleDriveSyncService.syncSpreadsheet(target, {
      trigger: "manual",
      triggeredBy: req.user?._id || req.user?.id,
    });

    await auditService.logAction({
      actor: req.user,
      action: "GOOGLE_DRIVE_SYNC",
      targetModel: "GoogleDriveSettings",
      targetId: "sync",
      summary: `Manually triggered Google Drive sync for: ${target}`,
      metadata: result,
      ipAddress: req.ip,
    });

    return ApiResponse.success(res, result, `Synchronization for '${target}' completed successfully`);
  }),

  /**
   * Triggers manual admin permissions reconciliation
   */
  syncPermissions: asyncHandler(async (req, res) => {
    const result = await googleDriveSyncService.reconcileAdminPermissions(req.user?._id || req.user?.id);

    await auditService.logAction({
      actor: req.user,
      action: "GOOGLE_DRIVE_PERMISSION_SYNC",
      targetModel: "GoogleDriveSettings",
      targetId: "permissions",
      summary: `Synchronized Google Drive permissions for ${result.totalAdmins || 0} administrators`,
      metadata: result,
      ipAddress: req.ip,
    });

    return ApiResponse.success(res, result, "Admin permissions synchronized with Google Drive folder");
  }),

  /**
   * Retrieves paginated synchronization logs with error diagnostics
   */
  getLogs: asyncHandler(async (req, res) => {
    const { page = 1, limit = 20, status, target } = req.query;
    const filter = {};
    if (status) filter.status = status;
    if (target) filter.target = target;

    const skip = (Number(page) - 1) * Number(limit);
    const [logs, total] = await Promise.all([
      GoogleDriveSyncLog.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(Number(limit))
        .populate("triggeredBy", "name email role")
        .lean(),
      GoogleDriveSyncLog.countDocuments(filter),
    ]);

    return ApiResponse.success(
      res,
      logs,
      "Sync logs retrieved",
      200,
      {
        total,
        page: Number(page),
        limit: Number(limit),
        totalPages: Math.ceil(total / Number(limit)),
      }
    );
  }),

  /**
   * Retries failed synchronization tasks
   */
  retryFailed: asyncHandler(async (req, res) => {
    const retries = await googleDriveSyncService.retryFailedTasks();

    await auditService.logAction({
      actor: req.user,
      action: "GOOGLE_DRIVE_RETRY",
      targetModel: "GoogleDriveSettings",
      targetId: "retry",
      summary: `Retried ${retries.length} failed Google Drive tasks`,
      ipAddress: req.ip,
    });

    return ApiResponse.success(res, retries, `Retried ${retries.length} failed sync tasks`);
  }),

  /**
   * Downloads locally cached Excel workbook
   */
  downloadLocal: asyncHandler(async (req, res) => {
    const { type } = req.params;
    const fileMap = {
      businesses: "RIFAH_Businesses.xlsx",
      users: "RIFAH_Users.xlsx",
      revenue_sharing: "RIFAH_Revenue_Sharing.xlsx",
      event_attendees: "RIFAH_Event_Attendees.xlsx",
    };

    const fileName = fileMap[type];
    if (!fileName) {
      return ApiResponse.error(res, "Invalid spreadsheet type", 400);
    }

    const filePath = path.join(CACHE_DIR, fileName);

    // If cached file doesn't exist yet, generate on the fly
    if (!fs.existsSync(filePath)) {
      const { generators } = await import("./generators/index.js");
      const generator = generators[type];
      if (generator) {
        const { buffer } = await generator();
        if (!fs.existsSync(CACHE_DIR)) {
          fs.mkdirSync(CACHE_DIR, { recursive: true });
        }
        fs.writeFileSync(filePath, buffer);
      }
    }

    if (!fs.existsSync(filePath)) {
      return ApiResponse.error(res, "File not available for download", 404);
    }

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);
    return res.sendFile(filePath);
  }),
};

export default googleDriveController;
