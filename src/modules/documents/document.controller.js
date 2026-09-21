import { documentService } from "./document.service.js";
import { storageService } from "../../infrastructure/storage/storage.service.js";
import { BadRequestError } from "../../shared/errors/errors.js";

function formatFileSize(bytes) {
  if (!bytes || bytes <= 0) return "0 KB";
  const units = ["B", "KB", "MB", "GB"];
  let value = bytes;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex++;
  }
  return `${value.toFixed(unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
}

export const documentController = {
  async getDocuments(req, res, next) {
    try {
      const { chapter } = req.query;
      const role = req.user?.role;
      const data = await documentService.getDocuments({ chapter, role, user: req.user });
      res.json({ success: true, data });
    } catch (err) {
      next(err);
    }
  },

  async create(req, res, next) {
    try {
      const payload = { ...req.body, uploadedBy: req.user?.id };
      const created = await documentService.createDocument(payload);
      res.status(201).json({ success: true, data: created });
    } catch (err) {
      next(err);
    }
  },

  async uploadDocument(req, res, next) {
    try {
      if (!req.file) {
        throw new BadRequestError("No file uploaded");
      }
      const { title, type, category, chapter, roleAccess } = req.body;
      if (!title || !type) {
        throw new BadRequestError("Title and type are required");
      }

      const fileUrl = await storageService.uploadFile(req.file, "documents");
      const size = formatFileSize(req.file.size);

      // roleAccess arrives as a JSON array string, comma-separated string, or is omitted (visible to all roles)
      let roleAccessArr = [];
      if (roleAccess) {
        try {
          const parsed = JSON.parse(roleAccess);
          roleAccessArr = Array.isArray(parsed) ? parsed : [];
        } catch {
          roleAccessArr = String(roleAccess).split(",").map((r) => r.trim()).filter(Boolean);
        }
      }

      // Chapter Admins can only upload scoped to their own chapter; Central/State Admin may set explicitly or leave global
      const effectiveChapter = req.user?.role === "chapter_admin" ? req.user.chapter : (chapter || undefined);

      const created = await documentService.createDocument({
        title,
        type,
        category: category || "General",
        fileUrl,
        size,
        chapter: effectiveChapter,
        roleAccess: roleAccessArr,
        uploadedBy: req.user?.id,
      });

      res.status(201).json({ success: true, data: created });
    } catch (err) {
      next(err);
    }
  },

  async update(req, res, next) {
    try {
      const { id } = req.params;
      const updated = await documentService.updateDocument(id, req.body);
      res.json({ success: true, data: updated });
    } catch (err) {
      next(err);
    }
  },

  async delete(req, res, next) {
    try {
      const { id } = req.params;
      await documentService.deleteDocument(id);
      res.json({ success: true, message: "Document deleted successfully" });
    } catch (err) {
      next(err);
    }
  },
};
