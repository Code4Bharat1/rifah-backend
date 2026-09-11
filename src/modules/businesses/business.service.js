import { Business } from "./business.model.js";
import { Chapter } from "../chapters/chapter.model.js";
import { generateSlug } from "../../shared/utils/generate-id.js";
import { parsePagination, buildPaginationMeta } from "../../shared/utils/pagination.js";
import { NotFoundError, ForbiddenError, ConflictError } from "../../shared/errors/errors.js";
import { ROLES } from "../../shared/constants/roles.js";
import { Payment } from "../payments/payment.model.js";
import { generateReferenceId } from "../../shared/utils/generate-id.js";
import { escapeRegex } from "../../middleware/sanitize.middleware.js";
import { getChapterFilter, resolveChapterIdByName } from "../../shared/utils/chapter-scope.js";
import { User } from "../users/user.model.js";
import { hashPassword } from "../../infrastructure/auth/password.js";
import { emailService } from "../../infrastructure/email/email.service.js";

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
  /**
   * Public directory search & filtering
   */
  searchDirectory: async (queryParams = {}, user = null) => {
    const { page, limit, skip } = parsePagination(queryParams);
    const andConditions = [];

    // Allow Active or unset status for public users
    if (!user || ![ROLES.SUPER_ADMIN, ROLES.SECRETARIAT, ROLES.CHAPTER_ADMIN].includes(user.role)) {
      andConditions.push({ status: { $ne: "Suspended" } });
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
      andConditions.push({
        $or: [
          { name: searchRegex },
          { tagline: searchRegex },
          { about: searchRegex },
          { categories: { $in: [searchRegex] } },
          { industry: searchRegex },
          { city: searchRegex },
          { state: searchRegex },
          { chapter: searchRegex },
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

    // 7. Verified Only Filter
    if (queryParams.verified === "true" || queryParams.verified === true) {
      andConditions.push({
        $or: [
          { verification: { $in: ["verified", "Verified", "approved", "Approved"] } },
          { isVerified: true },
        ],
      });
    }

    // 8. Featured Only Filter
    if (queryParams.featured === "true" || queryParams.featured === true) {
      andConditions.push({
        $or: [
          { featured: true },
          { membership: { $in: ["Enterprise", "Premium"] } },
        ],
      });
    }

    const finalFilter = andConditions.length > 0 ? { $and: andConditions } : {};

    // 9. Sorting Configuration
    let sortOption = { createdAt: -1 };
    const sortParam = (queryParams.sort || queryParams.sortBy || "").toLowerCase();
    if (sortParam === "rating") {
      sortOption = { rating: -1, reviewsCount: -1, createdAt: -1 };
    } else if (sortParam === "newest") {
      sortOption = { createdAt: -1 };
    } else if (sortParam === "featured") {
      sortOption = { featured: -1, rating: -1, createdAt: -1 };
    } else if (sortParam === "recommended") {
      sortOption = { featured: -1, rating: -1, createdAt: -1 };
    }

    const [businesses, total] = await Promise.all([
      Business.find(finalFilter).sort(sortOption).skip(skip).limit(limit),
      Business.countDocuments(finalFilter),
    ]);

    return {
      businesses,
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
      business = await Business.findById(trimmed).populate("owner", "name email phone");
    }

    if (!business) {
      // Case-insensitive exact slug match
      business = await Business.findOne({
        slug: new RegExp(`^${escapeRegex(trimmed)}$`, "i"),
      }).populate("owner", "name email phone");
    }

    if (!business) {
      // Fallback: match by business name
      business = await Business.findOne({
        name: new RegExp(`^${escapeRegex(trimmed)}$`, "i"),
      }).populate("owner", "name email phone");
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
      "city", "state", "address", "pincode", "chapter", "chapterId", "employees",
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

    const chapterFields = await resolveChapterFields(sanitizedData);
    Object.assign(sanitizedData, chapterFields);

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
    const isOwnChapterAdmin = isChapterAdmin && business.chapterId && user.chapterId && String(business.chapterId) === String(user.chapterId);

    if (!isOwner && !isAdmin && !isOwnChapterAdmin) {
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

    const updated = await Business.findByIdAndUpdate(id, sanitizedData, {
      new: true,
      runValidators: true,
    });

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
    let isNewUser = false;
    
    // Generate a random 8-character password
    const rawPassword = Math.random().toString(36).slice(-8);

    if (!user) {
      const passwordHash = await hashPassword(rawPassword);
      const chapterId = await resolveChapterIdByName(finalChapter);
      
      user = await User.create({
        name: data.ownerName.trim(),
        email: cleanEmail,
        passwordHash,
        phone: data.phone || "",
        chapter: finalChapter || "",
        chapterId,
        role: ROLES.BUSINESS_OWNER,
        isProfileComplete: true,
        forcePasswordChange: true, // Forces them to change password on first login
      });
      isNewUser = true;
    }

    // Provision Business Profile
    let slug = generateSlug(data.businessName || data.ownerName);
    const slugConflict = await Business.findOne({ slug });
    if (slugConflict) {
      slug = `${slug}-${Math.floor(1000 + Math.random() * 9000)}`;
    }

    const { chapterId, chapter } = await resolveChapterFields({ chapter: finalChapter });

    const business = await Business.create({
      name: data.businessName.trim(),
      slug,
      owner: user._id,
      industry: data.industry || "General",
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
      chapter: chapter || "",
      chapterId,
      membership: data.membershipTier || "Free",
      about: data.about || "",
      phone: data.phone || "",
      email: cleanEmail,
      verification: "Verified",
      status: "Active",
    });

    // If it's a paid tier, create a cash payment record
    const amountCollected = parseFloat(data.amountCollected) || 0;
    if (amountCollected > 0 || (data.membershipTier && data.membershipTier !== "Free")) {
      let invoiceNumber = generateReferenceId("INV", 4);
      while (await Payment.findOne({ invoiceNumber })) {
        invoiceNumber = generateReferenceId("INV", 4);
      }

      await Payment.create({
        invoiceNumber,
        payer: user._id,
        business: business._id,
        itemType: "Membership",
        description: "Admin Registered Business (Cash)",
        amount: amountCollected,
        currency: "INR",
        method: "CASH",
        status: "Paid",
        paidAt: new Date(),
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
    }

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

    const updates = {};
    if (verification) updates.verification = verification;
    if (membership) updates.membership = membership;
    if (status) updates.status = status;
    if (featured !== undefined) updates.featured = featured;

    const updated = await Business.findByIdAndUpdate(id, updates, { new: true });
    return updated;
  },
};
