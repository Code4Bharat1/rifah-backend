import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { GoogleDriveSettings } from "./google-drive-settings.model.js";
import { GoogleDriveSyncLog } from "./google-drive-sync-log.model.js";
import { googleDriveService } from "../../infrastructure/google/google-drive.service.js";
import { generators } from "./generators/index.js";
import { User } from "../users/user.model.js";
import { ROLES, RESPONSIBILITY_ROLES } from "../../shared/constants/roles.js";
import { env } from "../../config/env.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const CACHE_DIR = path.resolve(__dirname, `../../../${env.STORAGE.UPLOAD_DIR}/google-drive-cache`);

// In-memory debounce timers map
const debounceTimers = new Map();
let permissionDebounceTimer = null;
const inFlightSyncs = new Map();
const queuedFollowUpTargets = new Set();

class GoogleDriveSyncService {
  constructor() {
    this.ensureCacheDir();
  }

  ensureCacheDir() {
    try {
      if (!fs.existsSync(CACHE_DIR)) {
        fs.mkdirSync(CACHE_DIR, { recursive: true });
      }
    } catch (err) {
      console.warn("[GoogleDriveSyncService] Cache dir creation error:", err.message);
    }
  }

  /**
   * Retrieves or initializes the singleton settings
   */
  async getSettings(includeSecrets = false) {
    let query = GoogleDriveSettings.findOne({ isSingleton: "global" });
    if (includeSecrets) {
      query = query.select("+refreshToken +accessToken");
    }
    let settings = await query;

    if (!settings) {
      settings = await GoogleDriveSettings.create({
        isSingleton: "global",
        folderName: "RIFAH Central Administration Archive",
        folderId: env.GOOGLE.DRIVE_FOLDER_ID || "",
        isConnected: Boolean(env.GOOGLE.DRIVE_REFRESH_TOKEN),
        refreshToken: env.GOOGLE.DRIVE_REFRESH_TOKEN || "",
      });
    }

    // Auto-detect environment credentials if not linked yet
    if (!settings.isConnected && env.GOOGLE.DRIVE_REFRESH_TOKEN) {
      settings.isConnected = true;
      settings.refreshToken = env.GOOGLE.DRIVE_REFRESH_TOKEN;
      if (!settings.folderId && env.GOOGLE.DRIVE_FOLDER_ID) {
        settings.folderId = env.GOOGLE.DRIVE_FOLDER_ID;
      }
      await settings.save();
    }

    return settings;
  }

  /**
   * Resolves the active refresh token from DB or env
   */
  async getRefreshToken() {
    const settings = await this.getSettings(true);
    return settings.refreshToken || env.GOOGLE.DRIVE_REFRESH_TOKEN || "";
  }

  /**
   * Queues a debounced spreadsheet synchronization
   */
  queueSync(target, trigger = "event_hook", triggeredBy = null) {
    const validTargets = ["businesses", "users", "revenue_sharing", "event_attendees"];
    const targetsToQueue = target === "all" ? validTargets : [target];

    for (const t of targetsToQueue) {
      if (debounceTimers.has(t)) {
        clearTimeout(debounceTimers.get(t));
      }

      const timer = setTimeout(() => {
        debounceTimers.delete(t);
        this.syncSpreadsheet(t, { trigger, triggeredBy }).catch((err) => {
          console.error(`[GoogleDriveSyncService] Background sync failed for ${t}:`, err.message);
        });
      }, 5000); // 5-second coalescing debounce window

      debounceTimers.set(t, timer);
    }
  }

  /**
   * Queues a debounced permission reconciliation
   */
  queuePermissionSync(trigger = "event_hook", triggeredBy = null) {
    if (permissionDebounceTimer) {
      clearTimeout(permissionDebounceTimer);
    }

    permissionDebounceTimer = setTimeout(() => {
      permissionDebounceTimer = null;
      this.reconcileAdminPermissions(triggeredBy).catch((err) => {
        console.error("[GoogleDriveSyncService] Background permission sync failed:", err.message);
      });
    }, 4000);
  }

  /**
   * Synchronizes a specific spreadsheet:
   * 1. Runs the Excel generator to create an updated workbook
   * 2. Saves a local cached copy
   * 3. If Drive is connected, uploads or updates the file in the shared folder
   * 4. Logs the sync result in GoogleDriveSyncLog
   */
  async syncSpreadsheet(target, { trigger = "manual", triggeredBy = null, attemptCount = 1 } = {}) {
    if (target === "all") {
      return this.fullSyncAll(triggeredBy);
    }

    // Guard against concurrent overlapping syncs for the same target
    if (inFlightSyncs.has(target)) {
      queuedFollowUpTargets.add(target);
      return inFlightSyncs.get(target);
    }

    const syncPromise = (async () => {
      try {
        return await this._executeSyncSpreadsheet(target, { trigger, triggeredBy, attemptCount });
      } finally {
        inFlightSyncs.delete(target);
        if (queuedFollowUpTargets.has(target)) {
          queuedFollowUpTargets.delete(target);
          setTimeout(() => {
            this.syncSpreadsheet(target, { trigger: "event_hook" }).catch(() => {});
          }, 1000);
        }
      }
    })();

    inFlightSyncs.set(target, syncPromise);
    return syncPromise;
  }

  async _executeSyncSpreadsheet(target, { trigger = "manual", triggeredBy = null, attemptCount = 1 } = {}) {
    const generator = generators[target];
    if (!generator) {
      throw new Error(`Unknown synchronization target: ${target}`);
    }

    const startTime = Date.now();
    const settings = await this.getSettings(true);

    // Create a pending sync log entry
    const syncLog = await GoogleDriveSyncLog.create({
      taskType: "spreadsheet_sync",
      target,
      status: "processing",
      trigger,
      triggeredBy,
      attemptCount,
    });

    try {
      // 1. Generate updated workbook
      const { buffer, fileName, rowCount } = await generator();
      const fileSize = buffer.length;

      // 2. Save locally for instant offline availability / direct downloads
      this.ensureCacheDir();
      const localFilePath = path.join(CACHE_DIR, fileName);
      try {
        fs.writeFileSync(localFilePath, buffer);
      } catch (writeErr) {
        console.warn(`[GoogleDriveSyncService] Local cache write error for ${fileName}:`, writeErr.message);
      }

      let driveResult = null;
      const refreshToken = settings.refreshToken || env.GOOGLE.DRIVE_REFRESH_TOKEN;

      // 3. Upload to Google Drive if connected
      if (settings.isConnected && refreshToken) {
        // Ensure shared folder exists
        const folder = await googleDriveService.ensureSharedFolder({
          folderId: settings.folderId,
          folderName: settings.folderName,
          refreshToken,
        });

        if (folder.folderId !== settings.folderId || !settings.folderWebViewLink) {
          settings.folderId = folder.folderId;
          settings.folderWebViewLink = folder.webViewLink;
          await settings.save();
        }

        // Upload or update spreadsheet in Drive folder
        driveResult = await googleDriveService.uploadOrUpdateSpreadsheet({
          folderId: folder.folderId,
          fileName,
          buffer,
          refreshToken,
        });
      }

      // 4. Update file link in settings
      const targetMap = {
        businesses: "businesses",
        users: "users",
        revenue_sharing: "revenueSharing",
        event_attendees: "eventAttendees",
      };
      const key = targetMap[target] || target;

      if (!settings.fileLinks) settings.fileLinks = {};
      if (!settings.fileLinks[key]) settings.fileLinks[key] = {};

      settings.fileLinks[key].fileName = fileName;
      settings.fileLinks[key].lastSyncedAt = new Date();
      settings.fileLinks[key].rowCount = rowCount;
      settings.fileLinks[key].fileSize = fileSize;
      settings.fileLinks[key].status = "synced";
      settings.fileLinks[key].errorMessage = "";

      if (driveResult) {
        settings.fileLinks[key].fileId = driveResult.fileId;
        settings.fileLinks[key].webViewLink = driveResult.webViewLink;
      }
      await settings.save();

      // 5. Complete sync log
      const durationMs = Date.now() - startTime;
      syncLog.status = "success";
      syncLog.durationMs = durationMs;
      syncLog.completedAt = new Date();
      syncLog.metadata = {
        rowCount,
        fileSize,
        fileName,
        fileId: driveResult?.fileId || "cached_locally",
        webViewLink: driveResult?.webViewLink || "",
        action: driveResult?.action || "cached",
      };
      await syncLog.save();

      // Resolve any previous unresolved failed logs for this target
      await GoogleDriveSyncLog.updateMany(
        { target, status: "failed" },
        { $set: { status: "success", errorMessage: "Resolved by subsequent sync", completedAt: new Date() } }
      ).catch(() => {});

      return {
        success: true,
        target,
        fileName,
        rowCount,
        fileSize,
        durationMs,
        driveResult,
      };
    } catch (err) {
      const durationMs = Date.now() - startTime;
      console.error(`[GoogleDriveSyncService] Sync failure for ${target}:`, err);

      const isMaxRetries = attemptCount >= syncLog.maxAttempts;
      const nextRetryAt = isMaxRetries
        ? null
        : new Date(Date.now() + Math.pow(2, attemptCount) * 60 * 1000);

      syncLog.status = "failed";
      syncLog.durationMs = durationMs;
      syncLog.errorMessage = err.message || "Spreadsheet sync error";
      syncLog.errorDetails = err.stack || "";
      syncLog.nextRetryAt = nextRetryAt;
      syncLog.completedAt = new Date();
      await syncLog.save();

      // Update settings state
      try {
        const targetMap = {
          businesses: "businesses",
          users: "users",
          revenue_sharing: "revenueSharing",
          event_attendees: "eventAttendees",
        };
        const key = targetMap[target] || target;
        if (settings.fileLinks?.[key]) {
          settings.fileLinks[key].status = "failed";
          settings.fileLinks[key].errorMessage = err.message;
          await settings.save();
        }
      } catch (_) {}

      return {
        success: false,
        target,
        error: err.message,
        nextRetryAt,
      };
    }
  }

  /**
   * Reconciles Administrator permissions on the central Google Drive folder:
   * - Finds all active admins (Central, Country, State, Chapter)
   * - Adds Drive permissions for any missing admins
   * - Immediately removes Drive permissions for anyone who lost admin role or was deactivated
   * - Ensures folder is visible strictly to authorized admins only
   */
  async reconcileAdminPermissions(triggeredBy = null) {
    const startTime = Date.now();
    const settings = await this.getSettings(true);
    const refreshToken = settings.refreshToken || env.GOOGLE.DRIVE_REFRESH_TOKEN;

    const syncLog = await GoogleDriveSyncLog.create({
      taskType: "permission_sync",
      target: "permissions",
      status: "processing",
      trigger: triggeredBy ? "manual" : "event_hook",
      triggeredBy,
    });

    try {
      // 1. Fetch all active platform administrators
      const adminRoles = [
        ROLES.CENTRAL_ADMIN,
        ROLES.SECRETARIAT,
        ROLES.COUNTRY_ADMIN,
        ROLES.STATE_ADMIN,
        ROLES.CHAPTER_ADMIN,
        "super_admin",
        "admin",
      ];

      const inactiveStatuses = [
        "suspended",
        "Suspended",
        "inactive",
        "Inactive",
        "deleted",
        "Deleted",
        "deactivated",
        "Deactivated",
      ];

      const activeAdmins = await User.find({
        role: { $in: adminRoles },
        status: { $nin: inactiveStatuses },
      })
        .select("_id name email role chapter state status")
        .lean();

      // Also discover administrators granted panel access via organizational Role assignments
      try {
        const { Role } = await import("../roles/role.model.js");
        const activeRoleAssignments = await Role.find({
          status: "Active",
          panelType: { $in: ["central-admin", "state-admin", "chapter-admin"] },
        })
          .populate("userId", "_id name email role chapter state status")
          .lean();

        for (const ra of activeRoleAssignments) {
          if (ra.userId && !inactiveStatuses.includes(ra.userId.status)) {
            const userIdStr = String(ra.userId._id);
            if (!activeAdmins.some((a) => String(a._id) === userIdStr)) {
              activeAdmins.push({
                _id: ra.userId._id,
                name: ra.userId.name || "",
                email: ra.userId.email || "",
                role: ra.role || ra.panelType?.replace("-", "_") || "admin",
                chapter: ra.chapterId || ra.userId.chapter || "",
                state: ra.state || ra.userId.state || "",
                status: ra.userId.status || "active",
              });
            }
          }
        }
      } catch (roleErr) {
        console.warn("[GoogleDriveSyncService] Notice fetching organizational roles:", roleErr.message);
      }

      const activeAdminEmails = new Set(
        activeAdmins
          .map((a) => (a.email ? a.email.trim().toLowerCase() : ""))
          .filter(Boolean)
      );

      const added = [];
      const updated = [];
      const removed = [];
      const errors = [];

      // If connected to Google Drive, execute live permissions reconciliation
      if (settings.isConnected && refreshToken) {
        const folder = await googleDriveService.ensureSharedFolder({
          folderId: settings.folderId,
          folderName: settings.folderName,
          refreshToken,
        });

        // List existing Drive permissions
        const currentPermissions = await googleDriveService
          .listPermissions(folder.folderId, refreshToken)
          .catch(() => []);

        // 2. Add / Update permissions for active admins
        for (const admin of activeAdmins) {
          const email = admin.email ? admin.email.trim().toLowerCase() : "";
          if (!email) continue;

          // Central Admins have 'writer' role; State & Chapter have 'writer'
          const desiredRole = "writer";

          try {
            const permRes = await googleDriveService.addOrUpdatePermission({
              folderId: folder.folderId,
              email,
              role: desiredRole,
              refreshToken,
            });

            if (permRes.updated) {
              updated.push({ email, role: desiredRole, permissionId: permRes.permissionId });
            } else {
              added.push({ email, role: desiredRole, permissionId: permRes.permissionId });
            }
          } catch (pErr) {
            console.warn(`[GoogleDriveSyncService] Failed to share folder with ${email}:`, pErr.message);
            errors.push({ email, error: pErr.message });
          }
        }

        // 3. Revoke permissions for anyone no longer an active admin or any public links
        for (const perm of currentPermissions) {
          const email = (perm.emailAddress || "").trim().toLowerCase();
          // Skip the owner of the drive folder itself
          if (perm.role === "owner" || (settings.googleEmail && email === settings.googleEmail.toLowerCase())) {
            continue;
          }

          const isPublicPermission = perm.type === "anyone" || perm.type === "domain";
          if (isPublicPermission || (email && !activeAdminEmails.has(email))) {
            try {
              await googleDriveService.removePermission({
                folderId: folder.folderId,
                permissionId: perm.id,
                refreshToken,
              });
              removed.push({ email: email || perm.type, permissionId: perm.id });
            } catch (rErr) {
              console.warn(`[GoogleDriveSyncService] Failed to revoke permission for ${email || perm.id}:`, rErr.message);
            }
          }
        }
      }

      // 4. Update settings syncedAdmins array
      settings.syncedAdmins = activeAdmins.map((admin) => {
        const email = (admin.email || "").toLowerCase().trim();
        const hasError = errors.find((e) => e.email === email);
        return {
          userId: admin._id,
          email,
          name: admin.name || "",
          role: admin.role,
          chapter: admin.chapter || "",
          state: admin.state || "",
          accessRole: "writer",
          status: hasError ? "failed" : "synced",
          syncedAt: new Date(),
          error: hasError ? hasError.error : "",
        };
      });
      await settings.save();

      // 5. Complete sync log
      const durationMs = Date.now() - startTime;
      syncLog.status = errors.length > 0 && added.length === 0 ? "failed" : "success";
      syncLog.durationMs = durationMs;
      syncLog.completedAt = new Date();
      syncLog.metadata = {
        totalAdmins: activeAdmins.length,
        addedCount: added.length,
        updatedCount: updated.length,
        removedCount: removed.length,
        errorsCount: errors.length,
        added,
        removed,
        errors,
      };
      await syncLog.save();

      // Resolve previous failed permission syncs if this sync succeeded
      if (syncLog.status === "success") {
        await GoogleDriveSyncLog.updateMany(
          { target: "permissions", status: "failed" },
          { $set: { status: "success", errorMessage: "Resolved by subsequent permission sync", completedAt: new Date() } }
        ).catch(() => {});
      }

      return {
        success: syncLog.status === "success",
        totalAdmins: activeAdmins.length,
        added,
        removed,
        errors,
        durationMs,
      };
    } catch (err) {
      const durationMs = Date.now() - startTime;
      console.error("[GoogleDriveSyncService] Permission reconciliation error:", err);

      syncLog.status = "failed";
      syncLog.durationMs = durationMs;
      syncLog.errorMessage = err.message;
      syncLog.errorDetails = err.stack;
      syncLog.completedAt = new Date();
      await syncLog.save();

      return {
        success: false,
        error: err.message,
      };
    }
  }

  /**
   * Performs full synchronization across all spreadsheets and permissions
   */
  async fullSyncAll(triggeredBy = null) {
    const results = {};
    const targets = ["businesses", "users", "revenue_sharing", "event_attendees"];

    for (const target of targets) {
      results[target] = await this.syncSpreadsheet(target, {
        trigger: triggeredBy ? "manual" : "cron",
        triggeredBy,
      });
    }

    results.permissions = await this.reconcileAdminPermissions(triggeredBy);

    const settings = await this.getSettings();
    settings.lastFullSyncAt = new Date();
    await settings.save();

    return results;
  }

  /**
   * Retries all failed sync tasks
   */
  async retryFailedTasks() {
    const failedLogs = await GoogleDriveSyncLog.find({
      status: "failed",
    })
      .sort({ createdAt: -1 })
      .limit(10);

    const retryResults = [];

    for (const log of failedLogs) {
      if (log.taskType === "spreadsheet_sync" && log.target) {
        const res = await this.syncSpreadsheet(log.target, {
          trigger: "retry",
          attemptCount: (log.attemptCount || 1) + 1,
        });
        if (res.success) {
          log.status = "success";
          log.errorMessage = "Resolved via retry";
          await log.save();
        }
        retryResults.push({ id: log._id, target: log.target, result: res });
      } else if (log.taskType === "permission_sync") {
        const res = await this.reconcileAdminPermissions();
        if (res.success) {
          log.status = "success";
          log.errorMessage = "Resolved via retry";
          await log.save();
        }
        retryResults.push({ id: log._id, target: "permissions", result: res });
      }
    }

    return retryResults;
  }
}

export const googleDriveSyncService = new GoogleDriveSyncService();
export default googleDriveSyncService;
