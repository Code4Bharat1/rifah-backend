import { Business } from "./business.model.js";
import { generateSlug } from "../../shared/utils/generate-id.js";
import { parsePagination, buildPaginationMeta } from "../../shared/utils/pagination.js";
import { NotFoundError, ForbiddenError, ConflictError } from "../../shared/errors/errors.js";
import { ROLES } from "../../shared/constants/roles.js";
import { escapeRegex } from "../../middleware/sanitize.middleware.js";
import { getChapterFilter } from "../../shared/utils/chapter-scope.js";

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
    const chapterScope = await getChapterFilter(user, 'direct');
    Object.assign(filter, chapterScope);

    if (
      queryParams.chapter &&
      queryParams.chapter !== "undefined" &&
      queryParams.chapter !== "null" &&
      queryParams.chapter.toLowerCase() !== "all" &&
      queryParams.chapter !== "All chapters" &&
      !chapterScope.chapter
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
      filter.industry = new RegExp(`^${escapeRegex(queryParams.industry.trim())}$`, "i");
    }

    if (
      queryParams.city &&
      queryParams.city !== "undefined" &&
      queryParams.city !== "null" &&
      queryParams.city.toLowerCase() !== "all" &&
      queryParams.city !== "All cities"
    ) {
      filter.city = new RegExp(`^${escapeRegex(queryParams.city.trim())}$`, "i");
    }

    if (
      queryParams.membership &&
      queryParams.membership !== "undefined" &&
      queryParams.membership !== "null" &&
      queryParams.membership.toLowerCase() !== "all"
    ) {
      filter.membership = new RegExp(`^${escapeRegex(queryParams.membership.trim())}$`, "i");
    }

    if (queryParams.verified === "true") {
      filter.verification = "verified";
    }

    if (queryParams.featured === "true") {
      filter.$or = [
        { featured: true },
        { membership: { $in: ["Enterprise", "Premium"] } },
      ];
    }

    let [businesses, total] = await Promise.all([
      Business.find(filter).sort(sort).skip(skip).limit(limit),
      Business.countDocuments(filter),
    ]);

    // Fallback: If featured query returns fewer than limit, supplement with other active businesses
    if (queryParams.featured === "true" && businesses.length < limit) {
      const existingIds = businesses.map((b) => b._id);
      const remainingLimit = limit - businesses.length;
      const suppFilter = { ...filter };
      delete suppFilter.$or;
      delete suppFilter.featured;
      suppFilter._id = { $nin: existingIds };
      const extraBiz = await Business.find(suppFilter).sort(sort).limit(remainingLimit);
      businesses = [...businesses, ...extraBiz];
      total = businesses.length;
    }

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

    // Ensure 100% dynamic rating and reviewsCount from actual MongoDB reviews
    const { Review } = await import("../reviews/review.model.js");
    const reviews = await Review.find({
      business: business._id,
      status: { $in: ["approved", "published", "pending"] },
    });
    const count = reviews.length;
    let avg = 0;
    if (count > 0) {
      const sum = reviews.reduce((acc, r) => acc + (Number(r.rating) || 0), 0);
      avg = Number((sum / count).toFixed(1));
    }
    if (business.rating !== avg || business.reviewsCount !== count) {
      business.rating = avg;
      business.reviewsCount = count;
      await Business.findByIdAndUpdate(business._id, { rating: avg, reviewsCount: count });
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
      return businessService.updateBusiness(existing._id, data, { id: ownerId, role: ROLES.BUSINESS_OWNER });
    }

    const { Settings } = await import("../settings/settings.model.js");
    const settings = await Settings.findOne({ isSingleton: "global" });
    const isManualVerification = settings ? settings.manualVerificationRequired : true;
    const initialStatus = isManualVerification ? "Pending Verification" : "Live";
    const initialVerification = isManualVerification ? "Pending" : "Verified";

    const ALLOWED_CREATE_FIELDS = [
      "name", "tagline", "about", "industry", "categories", "businessType",
      "city", "state", "address", "pincode", "chapter", "employees",
      "founded", "website", "taxId", "phone", "email", "hours",
      "accent", "logo", "coverImage", "gallery", "productsSummary",
      "servicesSummary", "certifications"
    ];

    const sanitizedData = {};
    for (const key of ALLOWED_CREATE_FIELDS) {
      if (data[key] !== undefined) {
        sanitizedData[key] = data[key];
      }
    }

    let slug = generateSlug(sanitizedData.name || data.name);
    const slugConflict = await Business.findOne({ slug });
    if (slugConflict) {
      slug = `${slug}-${Math.floor(1000 + Math.random() * 9000)}`;
    }

    return Business.create({
      ...sanitizedData,
      slug,
      owner: ownerId,
      status: initialStatus,
      verificationStatus: initialVerification,
      verification: "unverified",
      membership: "Free",
      featured: false,
      rating: 0,
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
    const isChapterAdmin = user.role === "chapter_admin";

    if (!isOwner && !isAdmin && !(isChapterAdmin && business.chapter === user.chapter)) {
      throw new ForbiddenError("You are not authorized to update this business profile");
    }

    let sanitizedData = { ...updateData };
    if (!isAdmin && !isChapterAdmin) {
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
      let slug = generateSlug(sanitizedData.name);
      const slugConflict = await Business.findOne({ slug, _id: { $ne: id } });
      if (slugConflict) {
        slug = `${slug}-${Math.floor(1000 + Math.random() * 9000)}`;
      }
      sanitizedData.slug = slug;
    }

    if (sanitizedData.industry && (!sanitizedData.categories || sanitizedData.categories.length === 0)) {
      sanitizedData.categories = [sanitizedData.industry];
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
  updateStatus: async (id, { verification, membership, status, featured }, user) => {
    const chapterScope = await getChapterFilter(user, 'direct');
    const business = await Business.findOne({ _id: id, ...chapterScope });
    if (!business) {
      throw new NotFoundError("Business not found or access denied");
    }

    const updates = {};
    if (verification) updates.verification = verification;
    if (membership) updates.membership = membership;
    if (status) updates.status = status;
    if (featured !== undefined) updates.featured = featured;

    const updated = await Business.findByIdAndUpdate(id, updates, { new: true });
    return updated;
  },
};
