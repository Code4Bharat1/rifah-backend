import { Business } from "./business.model.js";
import { generateSlug } from "../../shared/utils/generate-id.js";
import { parsePagination, buildPaginationMeta } from "../../shared/utils/pagination.js";
import { NotFoundError, ForbiddenError, ConflictError } from "../../shared/errors/errors.js";
import { ROLES } from "../../shared/constants/roles.js";

export const businessService = {
  /**
   * Public directory search & filtering
   */
  searchDirectory: async (queryParams = {}, user = null) => {
    const { page, limit, skip, sort } = parsePagination(queryParams);
    const filter = {};
    
    // Only apply active status filter for public/customer users
    if (!user || ![ROLES.SUPER_ADMIN, ROLES.SECRETARIAT, ROLES.CHAPTER_ADMIN].includes(user.role)) {
      filter.status = "Active";
    }

    // RBAC: Chapter Admin Scope Enforcement
    if (user && user.role === ROLES.CHAPTER_ADMIN) {
      filter.chapter = user.chapter;
    } else if (queryParams.chapter) {
      // Normal filtering if not forced by RBAC
      filter.chapter = queryParams.chapter;
    }

    if (queryParams.search) {
      filter.$or = [
        { name: { $regex: queryParams.search, $options: "i" } },
        { tagline: { $regex: queryParams.search, $options: "i" } },
        { about: { $regex: queryParams.search, $options: "i" } },
        { categories: { $regex: queryParams.search, $options: "i" } },
      ];
    }

    if (queryParams.category) {
      filter.categories = { $in: [queryParams.category] };
    }

    if (queryParams.industry) {
      filter.industry = queryParams.industry;
    }

    if (queryParams.city) {
      filter.city = queryParams.city;
    }

    if (queryParams.membership) {
      filter.membership = queryParams.membership;
    }

    if (queryParams.verified === "true") {
      filter.verification = "verified";
    }

    if (queryParams.featured === "true") {
      filter.featured = true;
    }

    const [businesses, total] = await Promise.all([
      Business.find(filter).sort(sort).skip(skip).limit(limit),
      Business.countDocuments(filter),
    ]);

    return {
      businesses,
      meta: buildPaginationMeta(total, page, limit),
    };
  },

  /**
   * Get single business by slug or ID
   */
  getBusinessBySlugOrId: async (identifier) => {
    const isObjectId = identifier.match(/^[0-9a-fA-F]{24}$/);
    const query = isObjectId ? { _id: identifier } : { slug: identifier };

    const business = await Business.findOne(query).populate("owner", "name email phone");
    if (!business) {
      throw new NotFoundError("Business profile not found");
    }
    return business;
  },

  /**
   * Get business owned by a specific user
   */
  getBusinessByOwnerId: async (ownerId) => {
    return Business.findOne({ owner: ownerId });
  },

  /**
   * Create a new business profile
   */
  createBusiness: async (data, ownerId) => {
    const existing = await Business.findOne({ owner: ownerId });
    if (existing) {
      throw new ConflictError("You already have an existing business profile");
    }

    let slug = generateSlug(data.name);
    const slugConflict = await Business.findOne({ slug });
    if (slugConflict) {
      slug = `${slug}-${Math.floor(1000 + Math.random() * 9000)}`;
    }

    return Business.create({
      ...data,
      slug,
      owner: ownerId,
    });
  },

  /**
   * Update business profile (Owner or Admin)
   */
  updateBusiness: async (id, updateData, user) => {
    const business = await Business.findById(id);
    if (!business) {
      throw new NotFoundError("Business not found");
    }

    const isOwner = String(business.owner) === String(user.id);
    const isAdmin = ["super_admin", "secretariat"].includes(user.role);

    if (!isOwner && !isAdmin) {
      throw new ForbiddenError("You are not authorized to update this business profile");
    }

    if (updateData.name && updateData.name !== business.name) {
      updateData.slug = generateSlug(updateData.name);
    }

    const updated = await Business.findByIdAndUpdate(id, updateData, {
      new: true,
      runValidators: true,
    });

    return updated;
  },

  /**
   * Admin: Update business verification/membership status
   */
  updateStatus: async (id, { verification, membership, status, featured }) => {
    const updates = {};
    if (verification) updates.verification = verification;
    if (membership) updates.membership = membership;
    if (status) updates.status = status;
    if (featured !== undefined) updates.featured = featured;

    const updated = await Business.findByIdAndUpdate(id, updates, { new: true });
    if (!updated) {
      throw new NotFoundError("Business not found");
    }
    return updated;
  },
};
