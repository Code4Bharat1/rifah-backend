import { Category } from "./category.model.js";
import { generateSlug } from "../../shared/utils/generate-id.js";
import { NotFoundError, ConflictError } from "../../shared/errors/errors.js";

export const categoryService = {
  listCategories: async (filter = {}) => {
    const query = {};
    if (filter.status) query.status = filter.status;
    if (filter.parent) query.parent = filter.parent;
    return Category.find(query).sort({ name: 1 });
  },

  getCategoryBySlug: async (slug) => {
    const category = await Category.findOne({ slug: slug.toLowerCase() });
    if (!category) {
      throw new NotFoundError("Category not found");
    }
    return category;
  },

  /**
   * Find-or-create a category by name. Used when a business enters a new
   * category/sub-category during registration so it becomes available to
   * everyone else via the public categories list.
   */
  ensureCategory: async (name, parent = "") => {
    const cleanName = (name || "").trim();
    if (!cleanName) return null;

    const slug = generateSlug(cleanName);
    const escapedName = cleanName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

    // 1. Try finding by slug OR by case-insensitive name
    try {
      const existing = await Category.findOne({
        $or: [
          { slug },
          { name: new RegExp(`^${escapedName}$`, "i") },
        ],
      });
      if (existing) return existing;

      return await Category.create({
        name: cleanName,
        slug,
        parent: (parent || "").trim(),
      });
    } catch (err) {
      // 2. Handle race condition or duplicate key on name/slug
      if (err.code === 11000) {
        try {
          const winner = await Category.findOne({
            $or: [
              { slug },
              { name: new RegExp(`^${escapedName}$`, "i") },
            ],
          });
          if (winner) return winner;
        } catch {}
      }
      // Never crash caller during auxiliary category creation
      return null;
    }
  },

  createCategory: async (data) => {
    const slug = generateSlug(data.name);
    const existing = await Category.findOne({ slug });
    if (existing) {
      throw new ConflictError("Category already exists");
    }

    return Category.create({
      ...data,
      slug,
    });
  },

  updateCategory: async (id, data) => {
    if (data.name) {
      data.slug = generateSlug(data.name);
    }
    const updated = await Category.findByIdAndUpdate(id, data, { new: true });
    if (!updated) {
      throw new NotFoundError("Category not found");
    }
    return updated;
  },

  deleteCategory: async (id) => {
    const deleted = await Category.findByIdAndDelete(id);
    if (!deleted) {
      throw new NotFoundError("Category not found");
    }
    return true;
  },
};
