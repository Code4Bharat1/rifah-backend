import { Document } from "./document.model.js";
import { getChapterFilter } from "../../shared/utils/chapter-scope.js";

export const documentService = {
  async getDocuments(filter = {}) {
    const query = { status: "Active" };
    if (filter.user) {
      const scopeFilter = await getChapterFilter(filter.user, 'direct');
      Object.assign(query, scopeFilter);
    }
    if (filter.chapter) {
      // Allow specific chapter matching or fallback to global/no-chapter docs
      query.$or = [{ chapter: filter.chapter }, { chapter: { $exists: false } }, { chapter: "" }];
    }
    if (filter.role) {
      if (query.$or) {
         // Merge with existing $or from chapter scope if needed, but since we are using getChapterFilter which returns { state: ... } or { chapter: ... },
         // we should probably use an $and wrapper or just add it to a new array.
         query.$and = [{ $or: query.$or }, { $or: [{ roleAccess: filter.role }, { roleAccess: { $size: 0 } }] }];
         delete query.$or;
      } else {
         query.$or = [{ roleAccess: filter.role }, { roleAccess: { $size: 0 } }];
      }
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
