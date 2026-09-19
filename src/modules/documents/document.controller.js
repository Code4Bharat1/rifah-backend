import { documentService } from "./document.service.js";

export const documentController = {
  async getDocuments(req, res, next) {
    try {
      const { chapter } = req.query;
      const role = req.user?.role;
      const data = await documentService.getDocuments({ chapter, role });
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
