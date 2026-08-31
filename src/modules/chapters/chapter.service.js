import { Chapter } from "./chapter.model.js";
import { generateSlug } from "../../shared/utils/generate-id.js";
import { NotFoundError, ConflictError } from "../../shared/errors/errors.js";

export const chapterService = {
  listChapters: async (filter = {}) => {
    const query = {};
    if (filter.status) query.status = filter.status;
    return Chapter.find(query).sort({ name: 1 });
  },

  getChapterById: async (id) => {
    const chapter = await Chapter.findById(id);
    if (!chapter) {
      throw new NotFoundError("Chapter not found");
    }
    return chapter;
  },

  getChapterBySlug: async (slug) => {
    const chapter = await Chapter.findOne({ slug: slug.toLowerCase() });
    if (!chapter) {
      throw new NotFoundError("Chapter not found");
    }
    return chapter;
  },

  createChapter: async (data) => {
    const slug = generateSlug(data.name);
    const existing = await Chapter.findOne({ slug });
    if (existing) {
      throw new ConflictError("Chapter already exists");
    }

    return Chapter.create({
      ...data,
      slug,
    });
  },

  updateChapter: async (id, data) => {
    if (data.name) {
      data.slug = generateSlug(data.name);
    }
    const updated = await Chapter.findByIdAndUpdate(id, data, { new: true });
    if (!updated) {
      throw new NotFoundError("Chapter not found");
    }
    return updated;
  },

  addUnit: async (chapterId, unitData) => {
    const chapter = await Chapter.findById(chapterId);
    if (!chapter) {
      throw new NotFoundError("Chapter not found");
    }
    chapter.units.push(unitData);
    await chapter.save();
    return chapter;
  },

  removeUnit: async (chapterId, unitId) => {
    const chapter = await Chapter.findById(chapterId);
    if (!chapter) {
      throw new NotFoundError("Chapter not found");
    }
    chapter.units = chapter.units.filter((u) => String(u._id) !== String(unitId));
    await chapter.save();
    return chapter;
  },
};
