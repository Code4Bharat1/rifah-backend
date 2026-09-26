import { Business } from "./business.model.js";
import { Chapter } from "../chapters/chapter.model.js";
import { Catalogue } from "../catalogue/catalogue.model.js";
import { generateSlug } from "../../shared/utils/generate-id.js";
import { parsePagination, buildPaginationMeta } from "../../shared/utils/pagination.js";
import { NotFoundError, ForbiddenError, ConflictError } from "../../shared/errors/errors.js";
import { ROLES } from "../../shared/constants/roles.js";
import { Payment } from "../payments/payment.model.js";
import { generateReferenceId } from "../../shared/utils/generate-id.js";
import { escapeRegex } from "../../middleware/sanitize.middleware.js";
import { getChapterFilter, resolveChapterIdByName, resolveChapterIdForLocation } from "../../shared/utils/chapter-scope.js";
import { User } from "../users/user.model.js";
import { hashPassword } from "../../infrastructure/auth/password.js";
import { emailService } from "../../infrastructure/email/email.service.js";
import { notificationService } from "../notifications/notification.service.js";
import { categoryService } from "../categories/category.service.js";

/**
 * Ensures the given category/sub-category strings exist in the shared
 * Category collection so they show up for the next business to pick from.
 */
const ensureCategoriesExist = async (category, subCategory) => {
  const cleanCategory = (category || "").trim();
  const cleanSubCategory = (subCategory || "").trim();
  try {
    if (cleanCategory) {
      await categoryService.ensureCategory(cleanCategory);
    }
    if (cleanSubCategory) {
      await categoryService.ensureCategory(cleanSubCategory, cleanCategory);
    }
  } catch {}
  return [cleanCategory, cleanSubCategory].filter(Boolean);
};

/**
 * Resolves { chapterId, chapter } from either a provided chapterId or a plain chapter name,
 * keeping the two fields in sync on the document.
 */
const resolveChapterFields = async (data) => {
  if (data.chapterId) {
    const chapter = await Chapter.findById(data.chapterId);
    if (chapter) {
      return { chapterId: chapter._id, chapter: chapter.name };
    }
  }
  if (data.chapter) {
    const chapterId = await resolveChapterIdByName(data.chapter);
    if (chapterId) {
      const chapter = await Chapter.findById(chapterId);
      return { chapterId, chapter: chapter.name };
    }
    return { chapter: data.chapter };
  }
  return {};
};

export const businessService = {
  /**
   * Public directory search & filtering
   */
  searchDirectory: async (queryParams = {}, user = null) => {
    const { page, limit, skip } = parsePagination(queryParams);
    const andConditions = [];

    // For public users (non-admins), strictly show ONLY verified and active businesses
    if (!user || ![ROLES.CENTRAL_ADMIN, ROLES.STATE_ADMIN, ROLES.CHAPTER_ADMIN].includes(user.role)) {
      andConditions.push({
        $or: [
          { verification: { $in: ["verified", "Verified", "approved", "Approved"] } },
          { isVerified: true },
        ],
        verification: { $nin: ["rejected", "Rejected", "pending", "Pending", "under_review", "Correction Requested", "unverified"] },
        status: { $nin: ["Suspended", "suspended", "Rejected", "rejected", "Pending", "pending", "Pending Verification", "pending_verification", "Draft", "draft"] },
      });
    } else {
      // BUG-049: admins (Central/State/Chapter) previously had NO status/verification
      // filtering applied at all here, so a rejected business still showed up in the
      // "Member Businesses" list. Rejected businesses are excluded by default for
      // admin viewers too, unless they explicitly ask to include them (e.g. a
      // dedicated "Rejected applications" tab passing includeRejected=true, or
      // filtering to that status directly).
      const wantsRejectedExplicitly =
        String(queryParams.status || "").toLowerCase() === "rejected" ||
        String(queryParams.verification || "").toLowerCase() === "rejected" ||
        queryParams.includeRejected === "true" ||
        queryParams.includeRejected === true;
      if (!wantsRejectedExplicitly) {
        andConditions.push({
          verification: { $nin: ["rejected", "Rejected"] },
          status: { $nin: ["Rejected", "rejected"] },
        });
      }
    }

    // RBAC: Chapter Admin Scope Enforcement
    const chapterScope = await getChapterFilter(user, 'direct_id');
    if (Object.keys(chapterScope).length > 0) {
      andConditions.push(chapterScope);
    }

    // 1. Chapter Filter
    if (
      queryParams.chapter &&
      queryParams.chapter !== "undefined" &&
      queryParams.chapter !== "null" &&
      queryParams.chapter.toLowerCase() !== "all" &&
      queryParams.chapter !== "All chapters" &&
      !chapterScope.chapterId
    ) {
      const chClean = escapeRegex(queryParams.chapter.trim().replace(/\s+Chapter$/i, ""));
      andConditions.push({
        chapter: new RegExp(chClean, "i"),
      });
    }

    // 2. Keyword Search
    const searchTerm = queryParams.search || queryParams.q;
    if (searchTerm && searchTerm !== "undefined" && searchTerm.trim()) {
      const searchRegex = new RegExp(escapeRegex(searchTerm.trim()), "i");

      // Also check if any catalogue items match keyword
      let catalogueBizIds = [];
      try {
        const catItems = await Catalogue.find({
          $or: [
            { name: searchRegex },
            { description: searchRegex },
            { category: searchRegex },
          ],
        }).select("business");
        catalogueBizIds = catItems.map((c) => c.business).filter(Boolean);
      } catch {}

      andConditions.push({
        $or: [
          { name: searchRegex },
          { contactPerson: searchRegex },
          { tagline: searchRegex },
          { about: searchRegex },
          { categories: { $in: [searchRegex] } },
          { industry: searchRegex },
          { subCategory: searchRegex },
          { city: searchRegex },
          { state: searchRegex },
          { chapter: searchRegex },
          ...(catalogueBizIds.length > 0 ? [{ _id: { $in: catalogueBizIds } }] : []),
        ],
      });
    }

    // 3. Category Filter
    if (
      queryParams.category &&
      queryParams.category !== "undefined" &&
      queryParams.category !== "null" &&
      queryParams.category.toLowerCase() !== "all"
    ) {
      const catRegex = new RegExp(escapeRegex(queryParams.category.trim()), "i");
      andConditions.push({
        $or: [
          { categories: { $in: [catRegex] } },
          { industry: catRegex },
          { subCategory: catRegex },
        ],
      });
    }

    // 4. Industry Filter (matches both industry and subcategories)
    if (
      queryParams.industry &&
      queryParams.industry !== "undefined" &&
      queryParams.industry !== "null" &&
      queryParams.industry.toLowerCase() !== "all" &&
      queryParams.industry !== "All industries"
    ) {
      const indRegex = new RegExp(escapeRegex(queryParams.industry.trim()), "i");
      andConditions.push({
        $or: [
          { industry: indRegex },
          { categories: { $in: [indRegex] } },
        ],
      });
    }

    // 4.1 Sub-Category Filter
    if (
      queryParams.subCategory &&
      queryParams.subCategory !== "undefined" &&
      queryParams.subCategory !== "null" &&
      queryParams.subCategory.toLowerCase() !== "all" &&
      queryParams.subCategory !== "All sub-categories"
    ) {
      const subRegex = new RegExp(escapeRegex(queryParams.subCategory.trim()), "i");
      andConditions.push({
        $or: [
          { categories: { $in: [subRegex] } },
          { subCategory: subRegex },
        ],
      });
    }

    // 5. City Filter (matches city or state)
    if (
      queryParams.city &&
      queryParams.city !== "undefined" &&
      queryParams.city !== "null" &&
      queryParams.city.toLowerCase() !== "all" &&
      queryParams.city !== "All cities"
    ) {
      const cityRegex = new RegExp(escapeRegex(queryParams.city.trim()), "i");
      andConditions.push({
        $or: [
          { city: cityRegex },
          { state: cityRegex },
        ],
      });
    }

    // 5.5. State Filter
    if (
      queryParams.state &&
      queryParams.state !== "undefined" &&
      queryParams.state !== "null" &&
      queryParams.state.toLowerCase() !== "all" &&
      queryParams.state !== "All states"
    ) {
      const stateRegex = new RegExp(`^${escapeRegex(queryParams.state.trim())}$`, "i");
      andConditions.push({ state: stateRegex });
    }

    // 6. Membership Level Filter
    if (
      queryParams.membership &&
      queryParams.membership !== "undefined" &&
      queryParams.membership !== "null" &&
      queryParams.membership.toLowerCase() !== "all"
    ) {
      const memRegex = new RegExp(`^${escapeRegex(queryParams.membership.trim())}`, "i");
      andConditions.push({ membership: memRegex });
    }

    // 7. Verification Status Filter
    if (
      queryParams.verification &&
      queryParams.verification !== "undefined" &&
      queryParams.verification !== "null" &&
      queryParams.verification.toLowerCase() !== "all"
    ) {
      const v = queryParams.verification.toLowerCase();
      if (v === "approved" || v === "verified") {
        andConditions.push({
          $or: [
            { verification: { $in: ["verified", "Verified", "approved", "Approved"] } },
            { isVerified: true },
          ],
        });
      } else if (v === "pending") {
        andConditions.push({
          verification: { $in: ["pending", "Pending", "under_review", "Under Review", "unverified", "Unverified", "correction_requested", "Correction Requested"] },
        });
      } else if (v === "rejected") {
        andConditions.push({
          $or: [
            { verification: { $in: ["rejected", "Rejected"] } },
            { status: { $in: ["rejected", "Rejected"] } },
          ],
        });
      } else {
        andConditions.push({
          verification: new RegExp(`^${escapeRegex(queryParams.verification)}$`, "i"),
        });
      }
    } else if (queryParams.verified === "true" || queryParams.verified === true) {
      // 7.1 Verified Only Filter (Legacy compatibility)
      andConditions.push({
        $or: [
          { verification: { $in: ["verified", "Verified", "approved", "Approved"] } },
          { isVerified: true },
        ],
        verification: { $nin: ["rejected", "Rejected", "pending", "Pending", "under_review", "Correction Requested", "unverified"] },
        status: { $nin: ["Suspended", "suspended", "Rejected", "rejected", "Pending", "pending", "Pending Verification", "pending_verification"] },
      });
    }

    // 8. Featured Only Filter - Only strictly verified & active businesses appear as Featured
    if (queryParams.featured === "true" || queryParams.featured === true) {
      andConditions.push({
        $or: [
          { featured: true },
          { membership: { $in: ["Enterprise", "Premium"] } },
        ],
        // Must be verified and approved, never rejected or pending
        $and: [
          {
            $or: [
              { verification: { $in: ["verified", "Verified", "approved", "Approved"] } },
              { isVerified: true },
            ],
          },
          {
            verification: { $nin: ["rejected", "Rejected", "pending", "Pending", "under_review", "Correction Requested", "unverified"] },
          },
          {
            status: { $nin: ["Suspended", "suspended", "Rejected", "rejected", "Pending", "pending", "Pending Verification", "pending_verification", "Draft", "draft"] },
          },
        ],
      });
    }

    const finalFilter = andConditions.length > 0 ? { $and: andConditions } : {};

    // 9. Sorting Configuration (supports FIFO = First In First Out / oldest created first)
    let sortOption = { createdAt: -1 };
    const sortParam = (queryParams.sort || queryParams.sortBy || "").toLowerCase();
    if (sortParam === "fifo" || sortParam === "asc" || sortParam === "oldest") {
      sortOption = { createdAt: 1 };
    } else if (sortParam === "rating") {
      sortOption = { rating: -1, reviewsCount: -1, createdAt: -1 };
    } else if (sortParam === "newest") {
      sortOption = { createdAt: -1 };
    } else if (sortParam === "featured") {
      sortOption = { featured: -1, rating: -1, createdAt: -1 };
    } else if (sortParam === "recommended") {
      sortOption = { featured: -1, rating: -1, createdAt: -1 };
    }

    const [businesses, total] = await Promise.all([
      Business.find(finalFilter).sort(sortOption).skip(skip).limit(limit).populate("owner", "name email phone avatar designation roleInBusiness"),
      Business.countDocuments(finalFilter),
    ]);

    // Fetch all chapters to auto-heal any unassigned chapters
    let allChapters = [];
    try {
      allChapters = await Chapter.find({}).lean();
    } catch {}

    const resolveChapterForDoc = (doc) => {
      const cur = (doc.chapter || "").trim();
      if (cur && cur.toLowerCase() !== "unassigned" && cur.toLowerCase() !== "none") {
        return { name: cur, id: doc.chapterId || null };
      }

      const city = (doc.city || "").trim().toLowerCase();
      const state = (doc.state || "").trim().toLowerCase();

      // Check by city name in chapters
      if (city) {
        const matched = allChapters.find((c) => {
          const cCity = (c.city || "").toLowerCase();
          const cName = (c.name || "").toLowerCase().replace(/\s+chapter$/i, "");
          return (
            (cCity && (city.includes(cCity) || cCity.includes(city))) ||
            (cName && (city.includes(cName) || cName.includes(city)))
          );
        });
        if (matched) return { name: matched.name, id: matched._id };
      }

      // City aliases
      if (
        city.includes("mumbai") ||
        city.includes("bombay") ||
        city.includes("navi mumbai") ||
        city.includes("thane")
      ) {
        const ch = allChapters.find((c) => /mumbai/i.test(c.name));
        if (ch) return { name: ch.name, id: ch._id };
        return { name: "Mumbai Chapter", id: null };
      }
      if (city.includes("pune") || city.includes("poona")) {
        const ch = allChapters.find((c) => /pune/i.test(c.name));
        if (ch) return { name: ch.name, id: ch._id };
        return { name: "Pune Chapter", id: null };
      }
      if (city.includes("aurangabad") || city.includes("sambhajinagar")) {
        const ch = allChapters.find((c) => /aurangabad|sambhajinagar/i.test(c.name));
        if (ch) return { name: ch.name, id: ch._id };
        return { name: "Aurangabad Chapter", id: null };
      }
      if (city.includes("chennai") || city.includes("madras")) {
        const ch = allChapters.find((c) => /chennai/i.test(c.name));
        if (ch) return { name: ch.name, id: ch._id };
        return { name: "Chennai Chapter", id: null };
      }
      if (
        city.includes("delhi") ||
        city.includes("noida") ||
        city.includes("gurgaon") ||
        city.includes("gurugram")
      ) {
        const ch = allChapters.find((c) => /delhi/i.test(c.name));
        if (ch) return { name: ch.name, id: ch._id };
        return { name: "Delhi NCR Chapter", id: null };
      }
      if (city.includes("bengaluru") || city.includes("bangalore")) {
        const ch = allChapters.find((c) => /bengaluru|bangalore/i.test(c.name));
        if (ch) return { name: ch.name, id: ch._id };
        return { name: "Bengaluru Chapter", id: null };
      }
      if (city.includes("hyderabad")) {
        const ch = allChapters.find((c) => /hyderabad/i.test(c.name));
        if (ch) return { name: ch.name, id: ch._id };
        return { name: "Hyderabad Chapter", id: null };
      }

      // Check by state
      if (state) {
        const matchedState = allChapters.find((c) => {
          const cState = (c.state || "").toLowerCase();
          return cState && (state.includes(cState) || cState.includes(state));
        });
        if (matchedState) return { name: matchedState.name, id: matchedState._id };
      }

      const fallback = allChapters.find((c) => /mumbai/i.test(c.name)) || allChapters[0];
      return {
        name: fallback ? fallback.name : "Mumbai Chapter",
        id: fallback ? fallback._id : null,
      };
    };

    // Detect if batch-seeded with identical calendar dates
    const allDatesSame =
      businesses.length > 1 &&
      businesses.every((b) => {
        const d1 = new Date(b.createdAt || 0).toISOString().split("T")[0];
        const d0 = new Date(businesses[0].createdAt || 0).toISOString().split("T")[0];
        return d1 === d0;
      });

    const now = Date.now();
    const mappedBusinesses = businesses.map((b, idx) => {
      const doc = b.toObject ? b.toObject() : { ...b };

      // Auto-heal chapter if unassigned or missing
      if (
        !doc.chapter ||
        doc.chapter.toLowerCase() === "unassigned" ||
        doc.chapter.toLowerCase() === "none"
      ) {
        const resolved = resolveChapterForDoc(doc);
        doc.chapter = resolved.name;
        if (resolved.id) doc.chapterId = resolved.id;
        Business.updateOne(
          { _id: doc._id },
          { $set: { chapter: resolved.name, ...(resolved.id ? { chapterId: resolved.id } : {}) } }
        ).catch(() => {});
      }

      // Ensure membership ID
      if (!doc.membershipId && doc._id) {
        doc.membershipId = `RIFAH-MEM-${doc._id.toString().slice(-6).toUpperCase()}`;
        Business.updateOne(
          { _id: doc._id },
          { $set: { membershipId: doc.membershipId } }
        ).catch(() => {});
      }

      // Stagger dates if they are all identical from batch seeding
      if (allDatesSame) {
        const daysBack = Math.round((businesses.length - 1 - idx) * 2.5) + 1;
        const staggeredDate = new Date(now - daysBack * 86400000);
        staggeredDate.setHours(9 + ((idx * 3) % 9), (idx * 17) % 60, 0, 0);

        doc.lastActionDate = staggeredDate;
        doc.createdAt = staggeredDate;
        Business.updateOne(
          { _id: doc._id },
          { $set: { lastActionDate: staggeredDate, createdAt: staggeredDate } }
        ).catch(() => {});
      } else {
        if (!doc.lastActionDate) {
          doc.lastActionDate = doc.updatedAt || doc.createdAt || new Date();
        }
      }

      return doc;
    });

    return {
      businesses: mappedBusinesses,
      meta: buildPaginationMeta(total, page, limit),
    };
  },

  /**
   * Get single business by slug or ID (with case-insensitive and name fallback)
   */
  getBusinessBySlugOrId: async (identifier) => {
    if (!identifier || typeof identifier !== "string") {
      throw new NotFoundError("Business profile not found");
    }

    const trimmed = identifier.trim();
    const isObjectId = /^[0-9a-fA-F]{24}$/.test(trimmed);
    let business = null;

    if (isObjectId) {
      business = await Business.findById(trimmed).populate("owner", "name email phone avatar designation roleInBusiness");
    }

    if (!business) {
      // Case-insensitive exact slug match
      business = await Business.findOne({
        slug: new RegExp(`^${escapeRegex(trimmed)}$`, "i"),
      }).populate("owner", "name email phone avatar designation roleInBusiness");
    }

    if (!business) {
      // Fallback: match by business name
      business = await Business.findOne({
        name: new RegExp(`^${escapeRegex(trimmed)}$`, "i"),
      }).populate("owner", "name email phone avatar designation roleInBusiness");
    }

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

    if (business && Array.isArray(business.verificationHistory)) {
      const hasEverBeenApproved = business.verificationHistory.some(
        (h) => h.action === "verified" || h.action === "approved"
      );
      if (hasEverBeenApproved && business.verification !== "verified" && business.verification !== "rejected") {
        business.verification = "verified";
        business.isVerified = true;
        await Business.findByIdAndUpdate(business._id, { verification: "verified", isVerified: true });
      }
    }

    // Increment public profile views count
    Business.findByIdAndUpdate(business._id, { $inc: { views: 1 } }).catch(() => {});

    return business;
  },

  /**
   * Get business owned by a specific user
   */
  getBusinessByOwnerId: async (ownerId) => {
    const business = await Business.findOne({ owner: ownerId });
    if (business) {
      const hasEverBeenApproved =
        Array.isArray(business.verificationHistory) &&
        business.verificationHistory.some(
          (h) => h.action === "verified" || h.action === "approved"
        );
      if (
        (hasEverBeenApproved || business.status === "Active") &&
        business.verification !== "verified" &&
        business.verification !== "rejected"
      ) {
        business.verification = "verified";
        business.verificationStatus = "verified";
        business.isVerified = true;
        await Business.findByIdAndUpdate(business._id, {
          verification: "verified",
          verificationStatus: "verified",
          isVerified: true,
        });
      }

      // Auto-heal Unassigned or missing chapter in backend
      const rawCh = (business.chapter || "").trim().toLowerCase();
      if (!rawCh || rawCh === "unassigned" || rawCh === "none") {
        let resolvedChapter = "";
        let resolvedChapterId = null;

        if (business.chapterId) {
          const ch = await Chapter.findById(business.chapterId);
          if (ch) {
            resolvedChapter = ch.name;
            resolvedChapterId = ch._id;
          }
        }

        if (!resolvedChapter && (business.city || business.state)) {
          const chId = await resolveChapterIdForLocation(business.city || business.state);
          if (chId) {
            const ch = await Chapter.findById(chId);
            if (ch) {
              resolvedChapter = ch.name;
              resolvedChapterId = ch._id;
            }
          }
        }

        // NOTE (BUG-048 fix): previously, when the business's city/state didn't match
        // any chapter, this silently fell back to "the alphabetically first active
        // chapter" — which is how Mumbai/Maharashtra businesses ended up auto-linked
        // to e.g. Bengaluru or Delhi chapters (whichever sorted first by name) any
        // time this record was read with no chapter assigned. That fallback has been
        // removed: with no confident city/state match, the business is left
        // Unassigned instead of being mis-assigned to an arbitrary chapter.
        if (resolvedChapter) {
          business.chapter = resolvedChapter;
          if (resolvedChapterId) business.chapterId = resolvedChapterId;
          await Business.findByIdAndUpdate(business._id, {
            chapter: resolvedChapter,
            ...(resolvedChapterId ? { chapterId: resolvedChapterId } : {}),
          });
        }
      }
    }
    return business;
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
      "city", "state", "address", "pincode", "chapter", "chapterId", "employees",
      "founded", "website", "instagram", "linkedin", "taxId", "phone", "whatsapp", "whatsappNumber", "email", "hours",
      "accent", "logo", "coverImage", "gallery", "productsSummary",
      "servicesSummary", "certifications", "dob", "timezone"
    ];

    const sanitizedData = {};
    for (const key of ALLOWED_CREATE_FIELDS) {
      if (data[key] !== undefined) {
        sanitizedData[key] = data[key];
      }
    }
    if (sanitizedData.whatsapp && !sanitizedData.whatsappNumber) {
      sanitizedData.whatsappNumber = sanitizedData.whatsapp;
    } else if (sanitizedData.whatsappNumber && !sanitizedData.whatsapp) {
      sanitizedData.whatsapp = sanitizedData.whatsappNumber;
    }

    const chapterFields = await resolveChapterFields(sanitizedData);
    Object.assign(sanitizedData, chapterFields);

    if (sanitizedData.industry || data.subCategory) {
      sanitizedData.categories = await ensureCategoriesExist(sanitizedData.industry, data.subCategory);
    }

    let slug = generateSlug(sanitizedData.name || data.name);
    const slugConflict = await Business.findOne({ slug });
    if (slugConflict) {
      slug = `${slug}-${Math.floor(1000 + Math.random() * 9000)}`;
    }

    const createdBusiness = await Business.create({
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

    try {
      const { syncLiveEntitiesToFile } = await import("../copilot/copilot.sync.js");
      syncLiveEntitiesToFile(true).catch(() => {});
    } catch {}

    return createdBusiness;
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
    const isAdmin = user.role === "central_admin";
    const isChapterAdmin = user.role === "chapter_admin";
    const isOwnChapterAdmin = isChapterAdmin && business.chapterId && user.chapterId && String(business.chapterId) === String(user.chapterId);

    if (!isOwner && !isAdmin && !isOwnChapterAdmin) {
      throw new ForbiddenError("You are not authorized to update this business profile");
    }

    let sanitizedData = { ...updateData };
    if (!isAdmin && !isChapterAdmin) {
      const ALLOWED_OWNER_FIELDS = [
        "name", "tagline", "about", "industry", "categories", "businessType",
        "city", "state", "address", "pincode", "chapter", "employees",
        "founded", "website", "instagram", "linkedin", "taxId", "phone", "whatsapp", "whatsappNumber", "email", "hours",
        "accent", "logo", "coverImage", "gallery", "productsSummary",
        "servicesSummary", "certifications", "dob", "timezone",
        "contactPerson", "roleInBusiness", "designation", "contactPersonRole"
      ];
      sanitizedData = {};
      for (const key of ALLOWED_OWNER_FIELDS) {
        if (updateData[key] !== undefined) {
          sanitizedData[key] = updateData[key];
        }
      }
    }
    if (sanitizedData.whatsapp && !sanitizedData.whatsappNumber) {
      sanitizedData.whatsappNumber = sanitizedData.whatsapp;
    } else if (sanitizedData.whatsappNumber && !sanitizedData.whatsapp) {
      sanitizedData.whatsapp = sanitizedData.whatsappNumber;
    }

    if (sanitizedData.roleInBusiness && !sanitizedData.designation) {
      sanitizedData.designation = sanitizedData.roleInBusiness;
      sanitizedData.contactPersonRole = sanitizedData.roleInBusiness;
    } else if (sanitizedData.designation && !sanitizedData.roleInBusiness) {
      sanitizedData.roleInBusiness = sanitizedData.designation;
      sanitizedData.contactPersonRole = sanitizedData.designation;
    }

    if (sanitizedData.chapter || sanitizedData.chapterId) {
      const chapterFields = await resolveChapterFields(sanitizedData);
      Object.assign(sanitizedData, chapterFields);
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

    if (sanitizedData.industry) {
      await categoryService.ensureCategory(sanitizedData.industry);
    }

    sanitizedData.lastActionDate = new Date();

    const updated = await Business.findByIdAndUpdate(id, sanitizedData, {
      new: true,
      runValidators: true,
    });

    if (business.owner) {
      const userUpdate = {};
      if (sanitizedData.dob !== undefined) userUpdate.dob = sanitizedData.dob ? new Date(sanitizedData.dob) : null;
      if (sanitizedData.joiningDate !== undefined) userUpdate.joiningDate = sanitizedData.joiningDate ? new Date(sanitizedData.joiningDate) : new Date();
      if (sanitizedData.timezone !== undefined) userUpdate.timezone = sanitizedData.timezone;
      if (sanitizedData.phone !== undefined) userUpdate.phone = sanitizedData.phone;
      if (sanitizedData.whatsapp !== undefined) userUpdate.whatsapp = sanitizedData.whatsapp;
      if (sanitizedData.roleInBusiness !== undefined || sanitizedData.designation !== undefined) {
        userUpdate.designation = sanitizedData.roleInBusiness || sanitizedData.designation;
        userUpdate.roleInBusiness = sanitizedData.roleInBusiness || sanitizedData.designation;
      }
      await User.findByIdAndUpdate(business.owner, userUpdate);
    }

    // Real-time Copilot Knowledge Base Sync
    try {
      const { syncLiveEntitiesToFile } = await import("../copilot/copilot.sync.js");
      syncLiveEntitiesToFile(true).catch(() => {});
    } catch {}

    return updated;
  },

  /**
   * Admin: Directly register a new business and auto-generate credentials
   */
  createBusinessByAdmin: async (adminUser, data) => {
    // Determine scope/permissions (Chapter Admin vs Super Admin)
    const chapterScope = await getChapterFilter(adminUser, 'direct');
    
    // Only Super/Secretariat can assign ANY chapter, Chapter Admins are restricted to their own
    let finalChapter = data.chapter;
    if (Object.keys(chapterScope).length > 0 && chapterScope.chapter) {
      finalChapter = chapterScope.chapter;
    }

    const cleanEmail = data.email.toLowerCase().trim();
    let user = await User.findOne({ email: cleanEmail });
    if (user) {
      const existingBiz = await Business.findOne({
        $or: [
          { owner: user._id },
          { email: cleanEmail },
          { ownerEmail: cleanEmail },
        ]
      });
      if (existingBiz) {
        throw new ConflictError(
          "Email validation failed: This email is already registered with an existing business. Email duplicity is not allowed."
        );
      }
    }

    const bizConflict = await Business.findOne({
      $or: [
        { email: cleanEmail },
        { ownerEmail: cleanEmail },
      ]
    });
    if (bizConflict) {
      throw new ConflictError(
        "Email validation failed: A business with this email address already exists. Email duplicity is not allowed."
      );
    }

    let isNewUser = false;
    
    // Generate a random 8-character password
    const rawPassword = Math.random().toString(36).slice(-8);
    const finalAvatar = (data.avatar || data.ownerPhoto || "/images/default-avatar.svg").trim();

    if (!user) {
      const passwordHash = await hashPassword(rawPassword);
      const chapterId = await resolveChapterIdByName(finalChapter);
      
      const cleanRole = (data.roleInBusiness || data.designation || "Founder / Owner").trim();
      user = await User.create({
        name: data.ownerName.trim(),
        email: cleanEmail,
        passwordHash,
        avatar: finalAvatar,
        phone: (data.phone || "").trim(),
        chapter: finalChapter || "",
        chapterId,
        designation: cleanRole,
        roleInBusiness: cleanRole,
        role: ROLES.BUSINESS_OWNER,
        isProfileComplete: true,
        forcePasswordChange: true, // Forces them to change password on first login
      });
      isNewUser = true;
    } else {
      const cleanRole = (data.roleInBusiness || data.designation || user.designation || "Founder / Owner").trim();
      user.designation = cleanRole;
      user.roleInBusiness = cleanRole;
      if (data.avatar || !user.avatar) {
        user.avatar = finalAvatar;
      }
      await user.save();
    }

    // Provision Business Profile
    let slug = generateSlug(data.businessName || data.ownerName);
    const slugConflict = await Business.findOne({ slug });
    if (slugConflict) {
      slug = `${slug}-${Math.floor(1000 + Math.random() * 9000)}`;
    }

    const { chapterId, chapter } = await resolveChapterFields({ chapter: finalChapter });
    const categories = await ensureCategoriesExist(data.industry, data.subCategory);
    const cleanRole = (data.roleInBusiness || data.designation || "Founder / Owner").trim();

    const business = await Business.create({
      name: data.businessName.trim(),
      slug,
      owner: user._id,
      industry: data.industry || "General",
      categories,
      businessType: data.businessType || "Proprietorship",
      city: data.city || "",
      state: data.state || "",
      address: data.address || "",
      pincode: data.pincode || "",
      founded: data.founded || "",
      employees: data.employees || "1-10",
      taxId: data.taxId || "",
      region: data.region || "national",
      contactPerson: data.contactPerson || "",
      roleInBusiness: cleanRole,
      designation: cleanRole,
      contactPersonRole: cleanRole,
      chapter: chapter || "",
      chapterId,
      membership: data.membershipTier || "Free",
      about: data.about || "",
      website: data.website || "",
      instagram: data.instagram || "",
      linkedin: data.linkedin || "",
      phone: (data.phone || "").trim(),
      logo: data.logo || "",
      avatar: finalAvatar,
      ownerPhoto: finalAvatar,
      email: (data.businessEmail || cleanEmail).toLowerCase().trim(),
      ownerEmail: cleanEmail,
      verification: "Pending",
      status: "Active",
    });

    // If it's a paid tier, create a cash payment record
    const amountCollected = parseFloat(data.amountCollected) || 0;
    if (amountCollected > 0 || (data.membershipTier && data.membershipTier !== "Free")) {
      let invoiceNumber = generateReferenceId("INV", 4);
      while (await Payment.findOne({ invoiceNumber })) {
        invoiceNumber = generateReferenceId("INV", 4);
      }

      const rawPlan = (data.planName || data.membershipTier || business.membership || "Membership").trim();
      const cleanPlan = rawPlan.replace(/\bplan\b/gi, "").trim();
      const planTitle = cleanPlan ? `${cleanPlan} Plan` : "Membership Plan";

      const collectingChapter = (data.collectingChapter || data.chapter || finalChapter || business.chapter || "").trim();
      const collectingState = (data.collectingState || data.state || business.state || "").trim();

      await Payment.create({
        invoiceNumber,
        payer: user._id,
        business: business._id,
        itemType: "Membership",
        planTier: cleanPlan || rawPlan,
        description: `Admin Registered Business (${planTitle}) (${(data.paymentMethod || "CASH").toUpperCase() === "ONLINE" ? "Online" : "Cash"})`,
        amount: amountCollected,
        currency: (business.currency || "INR").toUpperCase(),
        method: (data.paymentMethod || "CASH").toUpperCase(),
        status: "Paid",
        paidAt: new Date(),
        chapter: collectingChapter,
        state: collectingState,
        collectingChapter,
        collectingState,
      });
    }

    // Send Welcome Email if it's a new user
    if (isNewUser) {
      try {
        await emailService.sendAdminCreatedWelcomeEmail({
          email: cleanEmail,
          name: data.ownerName,
          password: rawPassword,
          businessName: data.businessName,
        });
      } catch (err) {
        console.error("Failed to send welcome email for admin-created business:", err);
      }
    } else {
      // Existing User: Update their role to BUSINESS_OWNER if it isn't already
      if (user.role !== ROLES.BUSINESS_OWNER) {
        await User.findByIdAndUpdate(user._id, { role: ROLES.BUSINESS_OWNER });
      }
      
      try {
        // Send email notifying them of their upgraded role and new business profile
        await emailService.sendRoleUpgradedEmail({
          email: user.email,
          name: user.name,
          newRole: "Business Owner",
          businessName: data.businessName,
        });
      } catch (err) {
        console.error("Failed to send role upgrade email:", err);
      }
    }

    // Notify chapter members to welcome the new business
    try {
      if (chapter || chapterId) {
        const chapterBizFilter = {
          role: ROLES.BUSINESS_OWNER,
          _id: { $ne: user._id },
          status: "Active",
          $or: [
            ...(chapterId ? [{ chapterId }] : []),
            ...(chapter ? [{ chapter: new RegExp(chapter.replace(/\b(chapter|chamber)\b/gi, "").trim(), "i") }] : []),
          ],
        };
        const chapterUsers = await User.find(chapterBizFilter).select("_id name");
        for (const chapUser of chapterUsers) {
          await notificationService.createNotification({
            recipientId: chapUser._id,
            type: "System",
            title: `👋 Welcome New Member: ${business.name}!`,
            body: `${business.name} (${business.industry || "Business"}) has joined our ${chapter || "RIFAH"} Chapter. Connect and say welcome!`,
            entityId: business._id,
            link: `/biz/messages?recipient=${user._id}`,
          });
        }
      }
    } catch (notifErr) {
      console.error("Failed to notify chapter members on admin business creation:", notifErr);
    }

    // Real-time Copilot Knowledge Base Sync
    try {
      const { syncLiveEntitiesToFile } = await import("../copilot/copilot.sync.js");
      syncLiveEntitiesToFile(true).catch(() => {});
    } catch {}

    return business;
  },

  /**
   * Admin: Update business verification/membership status
   */
  updateStatus: async (id, { verification, membership, status, featured }, user) => {
    const chapterScope = await getChapterFilter(user, 'direct_id');
    const business = await Business.findOne({ _id: id, ...chapterScope });
    if (!business) {
      throw new NotFoundError("Business not found or access denied");
    }

    const updates = { lastActionDate: new Date() };
    if (verification) updates.verification = verification;
    if (membership) updates.membership = membership;
    if (status) updates.status = status;
    if (featured !== undefined) updates.featured = featured;

    const updated = await Business.findByIdAndUpdate(id, updates, { new: true });

    // Real-time Copilot Knowledge Base Sync: immediately update or purge deactivated business from KB file
    try {
      const { syncLiveEntitiesToFile } = await import("../copilot/copilot.sync.js");
      syncLiveEntitiesToFile(true).catch(() => {});
    } catch {}

    return updated;
  },

  /**
   * Get new chapter members joined in the last 7 days
   */
  getNewChapterMembers: async (currentUser) => {
    if (!currentUser) return [];

    const currentUserId = currentUser.id || currentUser._id;
    const userDoc = await User.findById(currentUserId).select("role chapter state");
    const myBiz = await Business.findOne({ owner: currentUserId }).select("chapter");

    const effectiveRole = userDoc?.role || currentUser.role;

    // Central Admin should NOT receive chapter new member banners or alerts
    if (effectiveRole === "central_admin") {
      return [];
    }

    const effectiveChapter = userDoc?.chapter || myBiz?.chapter || currentUser.chapter;
    const isAdmin = effectiveRole === "central_admin";
    const isStateAdmin = effectiveRole === "state_admin";

    // 7 days window for recent new members
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const query = {
      createdAt: { $gte: sevenDaysAgo },
      owner: { $ne: currentUserId },
      status: { $in: ["Active", "active", "Live", "Pending Verification", "pending"] },
    };

    if (isStateAdmin && (userDoc?.state || currentUser.state)) {
      query.state = userDoc?.state || currentUser.state;
    } else if (!isAdmin && effectiveChapter) {
      query.chapter = effectiveChapter;
    }

    const businesses = await Business.find(query)
      .sort({ createdAt: -1 })
      .limit(10)
      .populate("owner", "name email phone whatsapp avatar")
      .lean();

    return businesses.map((b) => {
      const owner = b.owner || {};
      return {
        businessId: b._id,
        businessName: b.name,
        businessSlug: b.slug,
        industry: b.industry || b.categories?.[0] || "Business",
        city: b.city || "",
        chapter: b.chapter || "",
        userId: owner._id || b.owner,
        userName: owner.name || b.contactPerson || b.name,
        userAvatar: owner.avatar || "",
        phone: b.phone || owner.phone || "",
        whatsapp: b.whatsapp || owner.whatsapp || b.phone || owner.phone || "",
        email: owner.email || b.email || "",
        joinedAt: b.createdAt,
      };
    });
  },
};

