import { Catalogue } from "./catalogue.model.js";
import { Business } from "../businesses/business.model.js";
import { Settings } from "../settings/settings.model.js";
import { generateSlug } from "../../shared/utils/generate-id.js";
import { parsePagination, buildPaginationMeta } from "../../shared/utils/pagination.js";
import { NotFoundError, ForbiddenError } from "../../shared/errors/errors.js";

export const catalogueService = {
  /**
   * Search / Browse public catalogue
   */
  searchCatalogue: async (queryParams = {}) => {
    const { page, limit, skip, sort } = parsePagination(queryParams);
    const filter = { status: "Active" };

    if (queryParams.search) {
      filter.$or = [
        { name: { $regex: queryParams.search, $options: "i" } },
        { description: { $regex: queryParams.search, $options: "i" } },
        { category: { $regex: queryParams.search, $options: "i" } },
      ];
    }

    if (queryParams.type) {
      filter.type = queryParams.type;
    }

    if (queryParams.category) {
      filter.category = queryParams.category;
    }

    if (queryParams.city) {
      filter.city = queryParams.city;
    }

    if (queryParams.businessId) {
      filter.business = queryParams.businessId;
    }

    const [items, total] = await Promise.all([
      Catalogue.find(filter)
        .populate("business", "name slug chapter city rating verification membership")
        .sort(sort)
        .skip(skip)
        .limit(limit),
      Catalogue.countDocuments(filter),
    ]);

    return {
      items,
      meta: buildPaginationMeta(total, page, limit),
    };
  },

  /**
   * List catalogue items for a specific business
   */
  listByBusiness: async (businessId) => {
    return Catalogue.find({ business: businessId, status: "Active" });
  },

  /**
   * Create catalogue item (Business Owner)
   * Enforces maxCatalogueItems and maxImagesPerItem from global Settings.
   */
  createItem: async (data, user) => {
    const business = await Business.findById(data.businessId || user.businessId);
    if (!business) {
      throw new NotFoundError("Associated business not found");
    }

    if (String(business.owner) !== String(user.id)) {
      throw new ForbiddenError("You do not own this business");
    }

    // --- Enforce global settings limits ---
    const globalSettings = await Settings.findOne({ isSingleton: "global" });
    const maxItems = globalSettings?.maxCatalogueItems ?? 50;
    const maxImages = globalSettings?.maxImagesPerItem ?? 5;

    const currentCount = await Catalogue.countDocuments({ business: business._id });
    if (currentCount >= maxItems) {
      throw new ForbiddenError(`Catalogue limit reached. Maximum ${maxItems} items allowed per business.`);
    }

    if (data.images && Array.isArray(data.images) && data.images.length > maxImages) {
      throw new ForbiddenError(`Too many images. Maximum ${maxImages} images allowed per item.`);
    }

    const slug = generateSlug(data.name);

    return Catalogue.create({
      ...data,
      slug,
      business: business._id,
      city: business.city,
    });
  },

  /**
   * Update catalogue item
   */
  updateItem: async (id, updateData, user) => {
    const item = await Catalogue.findById(id).populate("business");
    if (!item) {
      throw new NotFoundError("Catalogue item not found");
    }

    const isOwner = String(item.business.owner) === String(user.id);
    const isAdmin = ["super_admin", "secretariat"].includes(user.role);

    if (!isOwner && !isAdmin) {
      throw new ForbiddenError("Unauthorized to update this item");
    }

    if (updateData.name) {
      updateData.slug = generateSlug(updateData.name);
    }

    const updated = await Catalogue.findByIdAndUpdate(id, updateData, { new: true });
    return updated;
  },

  /**
   * Delete catalogue item
   */
  deleteItem: async (id, user) => {
    const item = await Catalogue.findById(id).populate("business");
    if (!item) {
      throw new NotFoundError("Catalogue item not found");
    }

    const isOwner = String(item.business.owner) === String(user.id);
    const isAdmin = ["super_admin", "secretariat"].includes(user.role);

    if (!isOwner && !isAdmin) {
      throw new ForbiddenError("Unauthorized to delete this item");
    }

    await Catalogue.findByIdAndDelete(id);
    return true;
  },
};
