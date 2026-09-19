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
import { getChapterFilter, resolveChapterIdByName } from "../../shared/utils/chapter-scope.js";
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

    // Allow Active or unset status for public users
    if (!user || ![ROLES.CENTRAL_ADMIN, ROLES.STATE_ADMIN, ROLES.CHAPTER_ADMIN].includes(user.role)) {
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
      Business.find(finalFilter).sort(sortOption).skip(skip).limit(limit).populate("owner", "name email phone avatar designation roleInBusiness"),
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

    return business;
  },

  /**
   * Get business owned by a specific user
   */
  getBusinessByOwnerId: async (ownerId) => {
    const business = await Business.findOne({ owner: ownerId });
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
      
      const cleanRole = (data.roleInBusiness || data.designation || "Founder / Owner").trim();
      user = await User.create({
        name: data.ownerName.trim(),
        email: cleanEmail,
        passwordHash,
        phone: data.phone || "",
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
      phone: data.phone || "",
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

