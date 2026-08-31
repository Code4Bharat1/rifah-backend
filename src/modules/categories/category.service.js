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
