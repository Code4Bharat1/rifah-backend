import { Document } from "./document.model.js";

export const documentService = {
  async getDocuments(filter = {}) {
    const query = { status: "Active" };
    if (filter.chapter) {
      query.$or = [{ chapter: filter.chapter }, { chapter: { $exists: false } }, { chapter: "" }];
    }
    if (filter.role) {
      query.$or = [{ roleAccess: filter.role }, { roleAccess: { $size: 0 } }];
    }
    return await Document.find(query).sort({ createdAt: -1 });
  },

  async createDocument(data) {
    return await Document.create(data);
  },

  async updateDocument(id, data) {
    const doc = await Document.findByIdAndUpdate(id, data, { new: true });
    if (!doc) throw new Error("Document not found");
    return doc;
  },

  async deleteDocument(id) {
    const doc = await Document.findByIdAndDelete(id);
    if (!doc) throw new Error("Document not found");
    return doc;
  },
};
