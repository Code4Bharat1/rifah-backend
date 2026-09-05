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
    
    // Allow Active or unset status for public users
    if (!user || ![ROLES.SUPER_ADMIN, ROLES.SECRETARIAT, ROLES.CHAPTER_ADMIN].includes(user.role)) {
      filter.status = { $ne: "Suspended" };
    }

    // RBAC: Chapter Admin Scope Enforcement
    if (user && user.role === ROLES.CHAPTER_ADMIN) {
      filter.chapter = user.chapter;
    } else if (
      queryParams.chapter &&
      queryParams.chapter !== "undefined" &&
      queryParams.chapter !== "null" &&
      queryParams.chapter.toLowerCase() !== "all" &&
      queryParams.chapter !== "All chapters"
    ) {
      filter.chapter = new RegExp(`^${queryParams.chapter.trim()}$`, "i");
    }

    if (queryParams.search && queryParams.search !== "undefined" && queryParams.search.trim()) {
      const searchRegex = new RegExp(queryParams.search.trim(), "i");
      filter.$or = [
        { name: searchRegex },
        { tagline: searchRegex },
        { about: searchRegex },
        { categories: searchRegex },
        { industry: searchRegex },
        { city: searchRegex },
      ];
    }

    if (
      queryParams.category &&
      queryParams.category !== "undefined" &&
      queryParams.category !== "null" &&
      queryParams.category.toLowerCase() !== "all"
    ) {
      filter.categories = { $in: [new RegExp(queryParams.category, "i")] };
    }

    if (
      queryParams.industry &&
      queryParams.industry !== "undefined" &&
      queryParams.industry !== "null" &&
      queryParams.industry.toLowerCase() !== "all" &&
      queryParams.industry !== "All industries"
    ) {
      filter.industry = new RegExp(`^${queryParams.industry.trim()}$`, "i");
    }

    if (
      queryParams.city &&
      queryParams.city !== "undefined" &&
      queryParams.city !== "null" &&
      queryParams.city.toLowerCase() !== "all" &&
      queryParams.city !== "All cities"
    ) {
      filter.city = new RegExp(`^${queryParams.city.trim()}$`, "i");
    }

    if (
      queryParams.membership &&
      queryParams.membership !== "undefined" &&
      queryParams.membership !== "null" &&
      queryParams.membership.toLowerCase() !== "all"
    ) {
      filter.membership = new RegExp(`^${queryParams.membership.trim()}$`, "i");
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

    const { Settings } = await import("../settings/settings.model.js");
    const settings = await Settings.findOne({ isSingleton: "global" });
    const isManualVerification = settings ? settings.manualVerificationRequired : true;
    const initialStatus = isManualVerification ? "Pending Verification" : "Live";
    const initialVerification = isManualVerification ? "Pending" : "Verified";

    let slug = generateSlug(data.name);
    const slugConflict = await Business.findOne({ slug });
    if (slugConflict) {
      slug = `${slug}-${Math.floor(1000 + Math.random() * 9000)}`;
    }

    return Business.create({
      ...data,
      slug,
      owner: ownerId,
      status: initialStatus,
      verificationStatus: initialVerification,
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

    let sanitizedData = { ...updateData };
    if (!isAdmin) {
      const ALLOWED_OWNER_FIELDS = [
        "name", "tagline", "about", "industry", "categories", "businessType",
        "city", "state", "address", "pincode", "chapter", "employees",
        "founded", "website", "taxId", "phone", "email", "hours",
        "accent", "logo", "coverImage", "gallery", "productsSummary",
        "servicesSummary", "certifications"
      ];
      sanitizedData = {};
      for (const key of ALLOWED_OWNER_FIELDS) {
        if (updateData[key] !== undefined) {
          sanitizedData[key] = updateData[key];
        }
      }
    }

    if (sanitizedData.name && sanitizedData.name !== business.name) {
      sanitizedData.slug = generateSlug(sanitizedData.name);
    }

    const updated = await Business.findByIdAndUpdate(id, sanitizedData, {
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
