import { Category } from "./category.model.js";
import { generateSlug } from "../../shared/utils/generate-id.js";
import { NotFoundError, ConflictError } from "../../shared/errors/errors.js";
import { memoryCache } from "../../shared/utils/memory-cache.js";

export const categoryService = {
  listCategories: async (filter = {}) => {
    // Scaled for 10k/50k users: In-memory RAM cache for category listings (30-min TTL)
    const cacheKey = `categories_list_${JSON.stringify(filter || {})}`;
    const cached = memoryCache.get(cacheKey, 1000 * 60 * 30);
    if (cached) return cached;

    const query = {};
    if (filter.status) query.status = filter.status;
    if (filter.parent) query.parent = filter.parent;
    const categories = await Category.find(query).sort({ name: 1 }).lean();
    memoryCache.set(cacheKey, categories);
    return categories;
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

    const normalizedName = cleanName.replace(/\s+/g, " ").toLowerCase();
    const slug = generateSlug(cleanName);
    const escapedName = cleanName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

    // 1. Try finding by slug OR by case-insensitive / whitespace-normalized name.
    try {
      const existing = await Category.findOne({
        $or: [
          { slug },
          { name: new RegExp(`^${escapedName}$`, "i") },
          {
            name: new RegExp(`^${escapedName.replace(/\\s+/g, "\\s+")}$`, "i"),
          },
          { slug: generateSlug(normalizedName) },
        ],
      });
      if (existing) return existing;

      return await Category.create({
        name: cleanName,
        slug,
        parent: (parent || "").trim(),
      });
    } catch (err) {
      // 2. Handle race condition or duplicate key on name/slug.
      if (err.code === 11000) {
        try {
          const winner = await Category.findOne({
            $or: [{ slug }, { name: new RegExp(`^${escapedName}$`, "i") }],
          });
          if (winner) return winner;
        } catch {}
      }
      // Never crash caller during auxiliary category creation.
      return null;
    }
  },

  createCategory: async (data) => {
    const name = String(data.name || "").trim();
    if (!name) throw new ConflictError("Category name is required");

    const slug = generateSlug(name);
    const existing = await Category.findOne({
      $or: [
        { slug },
        {
          name: new RegExp(
            `^${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`,
            "i",
          ),
        },
      ],
    });
    if (existing) {
      throw new ConflictError("Category already exists");
    }

    const created = await Category.create({
      ...data,
      name,
      slug,
    });
    memoryCache.invalidate("categories_list");
    return created;
  },

  updateCategory: async (id, data) => {
    if (data.name) {
      const name = String(data.name).trim();
      if (!name) throw new ConflictError("Category name is required");
      const existing = await Category.findOne({
        _id: { $ne: id },
        name: new RegExp(
          `^${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`,
          "i",
        ),
      });
      if (existing) {
        throw new ConflictError("Category already exists");
      }
      data.name = name;
      data.slug = generateSlug(name);
    }
    const updated = await Category.findByIdAndUpdate(id, data, { new: true });
    if (!updated) {
      throw new NotFoundError("Category not found");
    }
    memoryCache.invalidate("categories_list");
    return updated;
  },

  deleteCategory: async (id) => {
    const deleted = await Category.findByIdAndDelete(id);
    if (!deleted) {
      throw new NotFoundError("Category not found");
    }
    memoryCache.invalidate("categories_list");
    return true;
  },
};
