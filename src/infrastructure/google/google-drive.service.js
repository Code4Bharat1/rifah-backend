import { OAuth2Client } from "google-auth-library";
import { env } from "../../config/env.js";

/**
 * Google Drive Infrastructure Service
 * Handles OAuth2 client lifecycle, Drive v3 REST API requests,
 * central shared folder operations, permission sync, and Excel file uploads.
 */
class GoogleDriveService {
  constructor() {
    this.clientId = env.GOOGLE.DRIVE_CLIENT_ID || env.GOOGLE.CLIENT_ID;
    this.clientSecret = env.GOOGLE.DRIVE_CLIENT_SECRET || env.GOOGLE.CLIENT_SECRET;
    this.redirectUri = env.GOOGLE.DRIVE_REDIRECT_URI || "http://localhost:5000/api/v1/google-drive/oauth-callback";
  }

  /**
   * Initializes OAuth2 client
   */
  getOAuthClient(customRedirectUri = null) {
    if (!this.clientId || !this.clientSecret) {
      return null;
    }
    return new OAuth2Client(this.clientId, this.clientSecret, customRedirectUri || this.redirectUri);
  }

  /**
   * Resilient fetch wrapper with exponential backoff for transient Google Drive API / network errors
   */
  async fetchWithRetry(url, options = {}, retries = 3, backoffMs = 800) {
    let lastError = null;
    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        const res = await fetch(url, options);
        // Retry on HTTP 429 (rate limit) or 5xx (Google temporary outage)
        if (!res.ok && (res.status === 429 || res.status >= 500) && attempt < retries) {
          const delay = backoffMs * Math.pow(2, attempt - 1) + Math.random() * 200;
          await new Promise((resolve) => setTimeout(resolve, delay));
          continue;
        }
        return res;
      } catch (err) {
        lastError = err;
        if (attempt < retries) {
          const delay = backoffMs * Math.pow(2, attempt - 1) + Math.random() * 200;
          await new Promise((resolve) => setTimeout(resolve, delay));
        }
      }
    }
    throw lastError || new Error(`Google API request to ${url} failed after ${retries} attempts`);
  }

  /**
   * Generates authorization URL for Central Admin to grant Google Drive permissions
   */
  getAuthUrl(state = "") {
    const oauth2Client = this.getOAuthClient();
    if (!oauth2Client) {
      throw new Error("GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET must be configured in environment");
    }

    const scopes = [
      "https://www.googleapis.com/auth/drive",
      "https://www.googleapis.com/auth/userinfo.email",
      "https://www.googleapis.com/auth/userinfo.profile",
    ];

    return oauth2Client.generateAuthUrl({
      access_type: "offline",
      prompt: "consent",
      scope: scopes,
      state: state || "rifah-central-admin-drive",
    });
  }

  /**
   * Exchanges authorization code for tokens
   */
  async exchangeCodeForTokens(code) {
    const oauth2Client = this.getOAuthClient();
    if (!oauth2Client) {
      throw new Error("Google OAuth client is not configured");
    }

    const { tokens } = await oauth2Client.getToken(code);
    let userInfo = null;

    if (tokens.access_token) {
      try {
        const userRes = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
          headers: { Authorization: `Bearer ${tokens.access_token}` },
        });
        if (userRes.ok) {
          userInfo = await userRes.json();
        }
      } catch (err) {
        console.warn("[GoogleDriveService] Failed to fetch user info:", err.message);
      }
    }

    return { tokens, userInfo };
  }

  /**
   * Resolves a valid Access Token given a Refresh Token or direct Access Token
   */
  async getAccessToken(refreshToken) {
    if (!refreshToken) {
      throw new Error("No Google Drive refresh token available");
    }

    const oauth2Client = this.getOAuthClient();
    if (!oauth2Client) {
      throw new Error("Google OAuth credentials missing in configuration");
    }

    oauth2Client.setCredentials({ refresh_token: refreshToken });
    const tokenResponse = await oauth2Client.getAccessToken();
    const token = typeof tokenResponse === "string" ? tokenResponse : tokenResponse?.token;

    if (!token) {
      throw new Error("Failed to acquire Google Drive access token from refresh token");
    }

    return token;
  }

  /**
   * Ensures the central shared folder exists on Central Admin's Google Drive.
   * If folderId is provided and valid, returns it; otherwise searches by name or creates it.
   */
  async ensureSharedFolder({ folderId = "", folderName = "RIFAH Central Administration Archive", refreshToken = "" } = {}) {
    const accessToken = await this.getAccessToken(refreshToken);

    // 1. If folderId is specified, verify it exists and is accessible
    if (folderId) {
      try {
        const verifyRes = await this.fetchWithRetry(
          `https://www.googleapis.com/drive/v3/files/${folderId}?fields=id,name,webViewLink,trashed`,
          {
            headers: { Authorization: `Bearer ${accessToken}` },
          }
        );

        if (verifyRes.ok) {
          const folderData = await verifyRes.json();
          if (!folderData.trashed) {
            return {
              folderId: folderData.id,
              folderName: folderData.name,
              webViewLink: folderData.webViewLink || `https://drive.google.com/drive/folders/${folderData.id}`,
            };
          }
        }
      } catch (err) {
        console.warn("[GoogleDriveService] Stored folderId check error:", err.message);
      }
    }

    // 2. Search for existing folder with exact name in root Drive
    try {
      const q = encodeURIComponent(`mimeType='application/vnd.google-apps.folder' and name='${folderName}' and trashed=false`);
      const searchRes = await this.fetchWithRetry(
        `https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,name,webViewLink)&pageSize=1`,
        {
          headers: { Authorization: `Bearer ${accessToken}` },
        }
      );

      if (searchRes.ok) {
        const data = await searchRes.json();
        if (data.files && data.files.length > 0) {
          const existing = data.files[0];
          return {
            folderId: existing.id,
            folderName: existing.name,
            webViewLink: existing.webViewLink || `https://drive.google.com/drive/folders/${existing.id}`,
          };
        }
      }
    } catch (err) {
      console.warn("[GoogleDriveService] Search folder error:", err.message);
    }

    // 3. Create new shared folder
    const createRes = await this.fetchWithRetry("https://www.googleapis.com/drive/v3/files?fields=id,name,webViewLink", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: folderName,
        mimeType: "application/vnd.google-apps.folder",
        description: "Official Central Shared Archive for RIFAH Chamber of Commerce & Industry administrators",
      }),
    });

    if (!createRes.ok) {
      const errText = await createRes.text();
      throw new Error(`Failed to create Google Drive folder: ${errText}`);
    }

    const createdData = await createRes.json();
    return {
      folderId: createdData.id,
      folderName: createdData.name,
      webViewLink: createdData.webViewLink || `https://drive.google.com/drive/folders/${createdData.id}`,
    };
  }

  /**
   * Lists all existing permissions on the shared folder
   */
  async listPermissions(folderId, refreshToken) {
    const accessToken = await this.getAccessToken(refreshToken);

    const res = await this.fetchWithRetry(
      `https://www.googleapis.com/drive/v3/files/${folderId}/permissions?fields=permissions(id,displayName,emailAddress,role,type)`,
      {
        headers: { Authorization: `Bearer ${accessToken}` },
      }
    );

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Failed to list Google Drive permissions: ${errText}`);
    }

    const data = await res.json();
    return data.permissions || [];
  }

  /**
   * Shares the folder with an administrator email.
   * If permission already exists, updates it.
   */
  async addOrUpdatePermission({ folderId, email, role = "writer", refreshToken }) {
    if (!email) {
      throw new Error("Email is required to grant Drive permission");
    }
    const cleanEmail = String(email).trim().toLowerCase();
    const accessToken = await this.getAccessToken(refreshToken);

    // Check if permission already exists
    const currentPermissions = await this.listPermissions(folderId, refreshToken).catch(() => []);
    const existing = currentPermissions.find(
      (p) => p.emailAddress && p.emailAddress.toLowerCase() === cleanEmail
    );

    if (existing) {
      // If role matches, no-op
      if (existing.role === role) {
        return {
          permissionId: existing.id,
          email: cleanEmail,
          role: existing.role,
          updated: false,
        };
      }

      // Update role
      const updateRes = await this.fetchWithRetry(
        `https://www.googleapis.com/drive/v3/files/${folderId}/permissions/${existing.id}`,
        {
          method: "PATCH",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ role }),
        }
      );

      if (!updateRes.ok) {
        const errText = await updateRes.text();
        throw new Error(`Failed to update Drive permission for ${cleanEmail}: ${errText}`);
      }

      return {
        permissionId: existing.id,
        email: cleanEmail,
        role,
        updated: true,
      };
    }

    // Create new permission
    const createRes = await this.fetchWithRetry(
      `https://www.googleapis.com/drive/v3/files/${folderId}/permissions?sendNotificationEmail=false`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          role,
          type: "user",
          emailAddress: cleanEmail,
        }),
      }
    );

    if (!createRes.ok) {
      const errText = await createRes.text();
      throw new Error(`Failed to grant Drive permission for ${cleanEmail}: ${errText}`);
    }

    const permData = await createRes.json();
    return {
      permissionId: permData.id,
      email: cleanEmail,
      role,
      updated: false,
    };
  }

  /**
   * Revokes/deletes a Drive permission for an admin
   */
  async removePermission({ folderId, permissionId, refreshToken }) {
    if (!permissionId) return false;
    const accessToken = await this.getAccessToken(refreshToken);

    const res = await this.fetchWithRetry(`https://www.googleapis.com/drive/v3/files/${folderId}/permissions/${permissionId}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!res.ok && res.status !== 404) {
      const errText = await res.text();
      throw new Error(`Failed to remove Drive permission (${permissionId}): ${errText}`);
    }

    return true;
  }

  /**
   * Uploads a new Excel workbook or updates an existing one in-place
   */
  async uploadOrUpdateSpreadsheet({
    folderId,
    fileName,
    buffer,
    mimeType = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    refreshToken,
  }) {
    const accessToken = await this.getAccessToken(refreshToken);

    // 1. Search if file already exists in folder
    let existingFileId = null;
    let existingWebViewLink = null;

    try {
      const q = encodeURIComponent(`name='${fileName}' and '${folderId}' in parents and trashed=false`);
      const searchRes = await this.fetchWithRetry(
        `https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,name,webViewLink)&pageSize=1`,
        {
          headers: { Authorization: `Bearer ${accessToken}` },
        }
      );

      if (searchRes.ok) {
        const data = await searchRes.json();
        if (data.files && data.files.length > 0) {
          existingFileId = data.files[0].id;
          existingWebViewLink = data.files[0].webViewLink;
        }
      }
    } catch (err) {
      console.warn("[GoogleDriveService] Error searching existing spreadsheet:", err.message);
    }

    // 2. If file already exists, update its content in place
    if (existingFileId) {
      const updateRes = await this.fetchWithRetry(
        `https://www.googleapis.com/upload/drive/v3/files/${existingFileId}?uploadType=media`,
        {
          method: "PATCH",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": mimeType,
            "Content-Length": String(buffer.length),
          },
          body: buffer,
        }
      );

      if (!updateRes.ok) {
        const errText = await updateRes.text();
        throw new Error(`Failed to update existing spreadsheet '${fileName}': ${errText}`);
      }

      const updatedData = await updateRes.json();
      return {
        fileId: updatedData.id,
        fileName,
        webViewLink: existingWebViewLink || `https://drive.google.com/file/d/${updatedData.id}/view`,
        action: "updated",
      };
    }

    // 3. Otherwise, create new file via multipart upload
    const boundary = `-------314159265358979323846_${Date.now()}`;
    const delimiter = `\r\n--${boundary}\r\n`;
    const closeDelimiter = `\r\n--${boundary}--`;

    const metadata = {
      name: fileName,
      parents: [folderId],
      mimeType,
      description: "RIFAH Platform Synchronized Administrative Workbook",
    };

    const metadataPart =
      `Content-Type: application/json; charset=UTF-8\r\n\r\n` + JSON.stringify(metadata);

    const mediaHeader = `Content-Type: ${mimeType}\r\n\r\n`;

    const multipartBody = Buffer.concat([
      Buffer.from(delimiter + metadataPart + delimiter + mediaHeader),
      buffer,
      Buffer.from(closeDelimiter),
    ]);

    const createRes = await this.fetchWithRetry(
      "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": `multipart/related; boundary=${boundary}`,
          "Content-Length": String(multipartBody.length),
        },
        body: multipartBody,
      }
    );

    if (!createRes.ok) {
      const errText = await createRes.text();
      throw new Error(`Failed to create spreadsheet '${fileName}' in Drive: ${errText}`);
    }

    const createdData = await createRes.json();
    return {
      fileId: createdData.id,
      fileName: createdData.name,
      webViewLink: createdData.webViewLink || `https://drive.google.com/file/d/${createdData.id}/view`,
      action: "created",
    };
  }
}

export const googleDriveService = new GoogleDriveService();
export default googleDriveService;
