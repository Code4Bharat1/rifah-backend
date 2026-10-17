import { Verification } from "./verification.model.js";
import { Business } from "../businesses/business.model.js";
import { isSubscriberTierBusiness } from "../businesses/business.service.js";
import { User } from "../users/user.model.js";
import { Payment } from "../payments/payment.model.js";
import { emailService } from "../../infrastructure/email/email.service.js";
import { whatsappService } from "../../infrastructure/whatsapp/whatsapp.service.js";
import { notificationService } from "../notifications/notification.service.js";
import { NotFoundError, BadRequestError, ForbiddenError } from "../../shared/errors/errors.js";
import { parsePagination, buildPaginationMeta } from "../../shared/utils/pagination.js";
import { ROLES } from "../../shared/constants/roles.js";
import { getChapterFilter } from "../../shared/utils/chapter-scope.js";

export const verificationService = {
  /**
   * Submit verification request with documents (New submission or Re-submission)
   */
  submitVerification: async (businessId, documents, user, notes = "") => {
    const business = await Business.findById(businessId);
    if (!business) {
      throw new NotFoundError("Business not found");
    }

    if (String(business.owner) !== String(user.id)) {
      throw new ForbiddenError("You are not the owner of this business");
    }

    if (isSubscriberTierBusiness(business)) {
      throw new ForbiddenError(
        "Business verification is exclusive to Chamber Memberships (Silver, Gold, Platinum, Diamond) and is not available for online Subscriber Tiers (Tier I - IV)."
      );
    }

    let verification = await Verification.findOne({ business: businessId });
    if (verification) {
      verification.documents = documents;
      verification.status = "pending";
      verification.submittedBy = user.id;
      if (notes) {
        verification.remarks = `Re-submitted: ${notes}`;
      }
      await verification.save();
    } else {
      verification = await Verification.create({
        business: businessId,
        submittedBy: user.id,
        documents,
        status: "pending",
        remarks: notes || "",
      });
    }

    // Check if the business has previously been verified/approved
    const isAlreadyVerified =
      business.verification === "verified" ||
      business.verification === "Verified" ||
      business.isVerified === true ||
      (Array.isArray(business.verificationHistory) &&
        business.verificationHistory.some((h) => h.action === "verified" || h.action === "approved"));

    if (isAlreadyVerified) {
      // Keep business verified so workspace credentials & privileges are never locked
      business.verification = "verified";
      business.isVerified = true;
    } else {
      business.verification = "pending";
    }

    if (!Array.isArray(business.verificationHistory)) {
      business.verificationHistory = [];
    }
    business.verificationHistory.push({
      action: "re_submitted",
      reason: notes || "Business owner re-submitted updated verification documents",
      reviewer: user.id,
      createdAt: new Date(),
    });
    if (business.documents !== undefined) {
      business.documents = documents;
    }
    await business.save();

    // Send in-app notification to the assigned Country Admin (or Central Admin if unassigned / India)
    try {
      const targetChapter = (business.chapter || "").trim();
      const targetState = (business.state || "").trim();
      const targetCountry = (business.country || "").trim();
      const targetCountryId = business.countryId;

      let targetAdmins = [];

      // ==========================================
      // [COUNTRY_MODULE_DISABLED] Country Admin Alert Routing
      // if (targetCountry && targetCountry.toLowerCase() !== "india") {
      //   const cAdminQuery = [];
      //   if (targetCountryId) cAdminQuery.push({ countryId: targetCountryId });
      //   cAdminQuery.push({ country: new RegExp(`^${targetCountry.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i") });
      //   targetAdmins = await User.find({
      //     role: ROLES.COUNTRY_ADMIN,
      //     status: "Active",
      //     $or: cAdminQuery,
      //   });
      // }
      // ==========================================

      // 2. If no Country Admin found (or India/unassigned), notify Central Admins
      if (targetAdmins.length === 0) {
        targetAdmins = await User.find({
          role: { $in: [ROLES.CENTRAL_ADMIN, "central_admin", "admin", "super_admin"] },
          status: "Active",
        });
      }

      for (const admin of targetAdmins) {
        await notificationService.createNotification({
          recipientId: admin._id,
          type: "Verification",
          title: "New Verification Submission",
          body: `Business "${business.name}" (${targetCountry || targetState || targetChapter || "National"}) has submitted verification documents for approval.`,
          entityId: verification._id,
          link: "/admin/verification",
        });
      }
    } catch (notifErr) {
      console.error("Failed to notify admin on verification submission:", notifErr);
    }

    return verification;
  },

  /**
   * Get verification status for a business
   */
  getVerificationByBusinessId: async (businessId, requester = null) => {
    const verification = await Verification.findOne({ business: businessId })
      .populate("business", "name slug chapter country countryId verification verificationReviewReason verificationRemarks verificationHistory")
      .populate("submittedBy", "name email");

    if (!verification) return null;

    if (requester && requester.role === ROLES.CHAPTER_ADMIN && requester.chapter) {
      const chapterRegex = new RegExp(`^${requester.chapter.trim()}$`, "i");
      if (verification.business && verification.business.chapter && !chapterRegex.test(verification.business.chapter)) {
        throw new ForbiddenError("You are not authorized to view verification details for this chapter");
      }
    }

    return verification;
  },

  /**
   * List all pending/submitted verification requests (Admin queue)
   */
  listVerifications: async (queryParams = {}, requester = null) => {
    const { page, limit, skip, sort } = parsePagination(queryParams);
    const filter = {};

    // RBAC: Chapter Admin Scope Enforcement
    const chapterScope = await getChapterFilter(requester, 'business_ref');
    Object.assign(filter, chapterScope);

    // State, Chapter, Country, and Search filtering
    const hasCountryFilter = queryParams.country && queryParams.country.toLowerCase() !== "all";
    const hasStateFilter = queryParams.state && queryParams.state.toLowerCase() !== "all";
    const hasChapterFilter = queryParams.chapter && queryParams.chapter.toLowerCase() !== "all";
    const hasSearchFilter = queryParams.search && queryParams.search.trim();

    if (hasCountryFilter || hasStateFilter || hasChapterFilter || hasSearchFilter) {
      const bizQuery = {};
      if (hasCountryFilter) {
        bizQuery.country = new RegExp(`^${queryParams.country.trim()}$`, "i");
      }
      if (hasStateFilter) {
        bizQuery.state = new RegExp(`^${queryParams.state.trim()}$`, "i");
      }
      if (hasChapterFilter) {
        bizQuery.chapter = new RegExp(`^${queryParams.chapter.trim()}$`, "i");
      }
      if (hasSearchFilter) {
        const sRegex = new RegExp(queryParams.search.trim(), "i");
        bizQuery.$or = [
          { name: sRegex },
          { taxId: sRegex },
          { city: sRegex },
          { email: sRegex },
        ];
      }
      if (chapterScope.business?.$in) {
        bizQuery._id = { $in: chapterScope.business.$in };
      }
      const matchedBusinesses = await Business.find(bizQuery).select('_id');
      const businessIds = matchedBusinesses.map(b => b._id);

      if (hasSearchFilter && !hasCountryFilter && !hasStateFilter && !hasChapterFilter && !chapterScope.business) {
        // Also search submittedBy users when performing global text search
        const matchedUsers = await User.find({
          $or: [
            { name: new RegExp(queryParams.search.trim(), "i") },
            { email: new RegExp(queryParams.search.trim(), "i") },
            { phone: new RegExp(queryParams.search.trim(), "i") },
          ]
        }).select('_id');
        const userIds = matchedUsers.map(u => u._id);
        filter.$or = [
          { business: { $in: businessIds } },
          { submittedBy: { $in: userIds } },
        ];
      } else {
        filter.business = { $in: businessIds };
      }
    }

    if (queryParams.status) {
      filter.status = queryParams.status;
    }

    const [verificationsRaw, total] = await Promise.all([
      Verification.find(filter)
        .populate("business", "name slug city state chapter country countryId membership paymentStatus isPaid verification verificationReviewReason")
        .populate("submittedBy", "name email phone")
        .populate("reviewedBy", "name chapter role")
        .sort(sort)
        .skip(skip)
        .limit(limit),
      Verification.countDocuments(filter),
    ]);

    // Find all paid records for businesses and users in this queue
    const businessIds = verificationsRaw.map((v) => v.business?._id).filter(Boolean);
    const userIds = verificationsRaw.map((v) => v.submittedBy?._id).filter(Boolean);

    let paidPayments = [];
    if (businessIds.length > 0 || userIds.length > 0) {
      paidPayments = await Payment.find({
        $or: [
          ...(businessIds.length > 0 ? [{ business: { $in: businessIds } }] : []),
          ...(userIds.length > 0 ? [{ payer: { $in: userIds } }] : []),
        ],
        status: { $in: ["Paid", "paid", "Completed", "completed"] },
      }).sort({ createdAt: -1 });
    }

    const verifications = verificationsRaw.map((v) => {
      const doc = v.toObject ? v.toObject() : v;
      const bizIdStr = doc.business?._id ? String(doc.business._id) : null;
      const userIdStr = doc.submittedBy?._id ? String(doc.submittedBy._id) : null;

      const hasPaidRecord = paidPayments.some(
        (p) =>
          (bizIdStr && p.business && String(p.business) === bizIdStr) ||
          (userIdStr && p.payer && String(p.payer) === userIdStr)
      );

      const isPaidMembership =
        doc.business?.membership &&
        doc.business.membership.toLowerCase() !== "free" &&
        doc.business.membership.toLowerCase() !== "free listing";

      const isPaidStatus =
        doc.business?.paymentStatus?.toLowerCase() === "paid" ||
        doc.business?.isPaid === true ||
        hasPaidRecord ||
        isPaidMembership;

      if (doc.business) {
        doc.business.paymentStatus = isPaidStatus ? "Paid" : (doc.business.paymentStatus || "Pending");
        doc.business.isPaid = isPaidStatus;
      }
      doc.paymentStatus = isPaidStatus ? "Paid" : "Pending";

      if (requester?.role === ROLES.CHAPTER_ADMIN) {
        if (!doc.business || !doc.submittedBy) {
          doc.status = "rejected";
          doc.isOrphaned = true;
        }
      }

      return doc;
    });

    return {
      verifications,
      meta: buildPaginationMeta(total, page, limit),
    };
  },

  /**
   * Review verification (Secretariat/Admin: approve/reject/request changes)
   */
  reviewVerification: async (verificationId, { status, remarks, reason }, reviewer) => {
    const verification = await Verification.findById(verificationId);
    if (!verification) {
      throw new NotFoundError("Verification request not found");
    }

    const business = await Business.findById(verification.business);
    
    // RBAC: Geographic Scope Enforcement
    if (!reviewer || ![ROLES.CENTRAL_ADMIN, ROLES.COUNTRY_ADMIN, ROLES.STATE_ADMIN, ROLES.CHAPTER_ADMIN].includes(reviewer.role)) {
      throw new ForbiddenError("You are not authorized to verify businesses.");
    }

    if (reviewer.role === ROLES.COUNTRY_ADMIN) {
      const reviewerCountry = (reviewer.country || "").trim().toLowerCase();
      const reviewerCountryId = reviewer.countryId ? String(reviewer.countryId) : null;
      const bizCountry = (business?.country || "").trim().toLowerCase();
      const bizCountryId = business?.countryId ? String(business.countryId) : null;

      const idMatch = Boolean(reviewerCountryId && bizCountryId && reviewerCountryId === bizCountryId);
      const nameMatch = Boolean(reviewerCountry && bizCountry && reviewerCountry === bizCountry);

      if (!idMatch && !nameMatch) {
        throw new ForbiddenError("You are not authorized to review verifications outside your country.");
      }
    }

    if (reviewer.role === ROLES.STATE_ADMIN && reviewer.state) {
      const stateRegex = new RegExp(`^${reviewer.state.trim()}$`, "i");
      if (business && (!stateRegex.test(business.state || "") && !stateRegex.test(business.chapter || ""))) {
        throw new ForbiddenError("You are not authorized to review verifications outside your state.");
      }
    }
    
    if (reviewer.role === ROLES.CHAPTER_ADMIN) {
      const cleanAdminChapter = (reviewer.chapter || "").replace(/\b(chapter|chamber)\b/gi, "").trim().toLowerCase();
      const cleanBizChapter = (business?.chapter || "").replace(/\b(chapter|chamber)\b/gi, "").trim().toLowerCase();
      const adminChapterId = reviewer.chapterId ? String(reviewer.chapterId) : "";
      const bizChapterId = business?.chapterId ? String(business.chapterId) : "";

      const idsMatch = Boolean(adminChapterId && bizChapterId && adminChapterId === bizChapterId);
      const namesMatch = Boolean(
        cleanAdminChapter &&
        cleanBizChapter &&
        (cleanAdminChapter === cleanBizChapter ||
          cleanAdminChapter.includes(cleanBizChapter) ||
          cleanBizChapter.includes(cleanAdminChapter))
      );

      if (!idsMatch && !namesMatch) {
        throw new ForbiddenError("You are not authorized to review verifications for this chapter.");
      }
    }

    let finalStatus = status;
    if (status === "approved") finalStatus = "verified";
    if (status === "correction" || status === "changes_required") finalStatus = "correction_requested";

    const finalRemarks = (remarks || reason || "").trim();

    verification.status = finalStatus;
    if (finalRemarks) verification.remarks = finalRemarks;
    verification.reviewedBy = reviewer.id || reviewer;
    verification.reviewedAt = new Date();

    if (Array.isArray(verification.documents)) {
      verification.documents.forEach((doc) => {
        if (finalStatus === "verified") {
          doc.status = "approved";
        } else if (finalStatus === "rejected") {
          doc.status = "rejected";
        } else if (finalStatus === "correction_requested") {
          doc.status = "under_review";
        }
      });
    }

    await verification.save();

    // Update business profile verification status & reason
    if (business) {
      if (finalStatus === "verified") {
        business.verification = "verified";
        business.isVerified = true;
        business.status = "Active";
      } else if (finalStatus === "rejected") {
        business.verification = "rejected";
        business.isVerified = false;
      } else if (finalStatus === "correction_requested") {
        const wasVerified =
          business.verification === "verified" ||
          business.isVerified === true ||
          (Array.isArray(business.verificationHistory) &&
            business.verificationHistory.some((h) => h.action === "verified" || h.action === "approved"));
        if (!wasVerified) {
          business.verification = "correction_requested";
          business.isVerified = false;
        }
      }
      business.verificationReviewReason = finalRemarks;
      business.verificationRemarks = finalRemarks;

      if (!Array.isArray(business.verificationHistory)) {
        business.verificationHistory = [];
      }
      business.verificationHistory.push({
        action: finalStatus,
        reason: finalRemarks,
        reviewer: reviewer.id || reviewer,
        createdAt: new Date(),
      });

      await business.save();

      if (business.owner) {
        try {
          const ownerUser = await User.findById(business.owner);
          if (ownerUser?.email) {
            await emailService.sendVerificationStatusEmail({
              email: ownerUser.email,
              ownerName: ownerUser.name,
              businessName: business.name,
              status: finalStatus,
              notes: finalRemarks,
            });
          }

          // In-app notification
          const isApproved = finalStatus === "verified";
          await notificationService.createNotification({
            recipientId: business.owner,
            type: "Verification",
            title: isApproved ? "Business Verification Approved" : "Verification Status Updated",
            body: isApproved
              ? `Congratulations! Your business "${business.name}" has been verified and approved by RIFAH Central Administration.`
              : `Your verification request has been updated to "${finalStatus}". Remarks: ${finalRemarks || "None"}.`,
            entityId: business._id,
            link: "/biz/profile",
          });

          if (isApproved) {
            const ownerUser = await User.findById(business.owner).select("name phone email");
            const targetPhone = ownerUser?.phone || business.phone;
            if (targetPhone) {
              whatsappService.sendMembershipWelcome({
                phone: targetPhone,
                name: ownerUser?.name || business.name,
                tier: business.membership || "Verified Business",
                businessName: business.name,
              }).catch(waErr => console.error("[WHATSAPP BIZ APPROVAL ERROR]:", waErr?.message || waErr));
            }
          }
        } catch (err) {
          console.error("Failed to send verification status email/notification:", err);
        }
      }
    }

    return verification;
  },

  /**
   * Update remarks / audit notes against uploaded documents
   */
  updateRemarks: async (verificationId, remarks, reviewer) => {
    const verification = await Verification.findById(verificationId);
    if (!verification) {
      throw new NotFoundError("Verification request not found");
    }

    const business = await Business.findById(verification.business);

    if (!reviewer || ![ROLES.CENTRAL_ADMIN, ROLES.COUNTRY_ADMIN, ROLES.STATE_ADMIN, ROLES.CHAPTER_ADMIN].includes(reviewer.role)) {
      throw new ForbiddenError("You are not authorized to review verifications.");
    }

    if (reviewer.role === ROLES.COUNTRY_ADMIN) {
      const reviewerCountry = (reviewer.country || "").trim().toLowerCase();
      const reviewerCountryId = reviewer.countryId ? String(reviewer.countryId) : null;
      const bizCountry = (business?.country || "").trim().toLowerCase();
      const bizCountryId = business?.countryId ? String(business.countryId) : null;

      const idMatch = Boolean(reviewerCountryId && bizCountryId && reviewerCountryId === bizCountryId);
      const nameMatch = Boolean(reviewerCountry && bizCountry && reviewerCountry === bizCountry);

      if (!idMatch && !nameMatch) {
        throw new ForbiddenError("You are not authorized to update verifications outside your country.");
      }
    }

    if (reviewer.role === ROLES.STATE_ADMIN && reviewer.state) {
      const stateRegex = new RegExp(`^${reviewer.state.trim()}$`, "i");
      if (business && (!stateRegex.test(business.state || "") && !stateRegex.test(business.chapter || ""))) {
        throw new ForbiddenError("You are not authorized to update verifications outside your state.");
      }
    }

    if (reviewer.role === ROLES.CHAPTER_ADMIN) {
      const cleanAdminChapter = (reviewer.chapter || "").replace(/\b(chapter|chamber)\b/gi, "").trim().toLowerCase();
      const cleanBizChapter = (business?.chapter || "").replace(/\b(chapter|chamber)\b/gi, "").trim().toLowerCase();
      const adminChapterId = reviewer.chapterId ? String(reviewer.chapterId) : "";
      const bizChapterId = business?.chapterId ? String(business.chapterId) : "";

      const idsMatch = Boolean(adminChapterId && bizChapterId && adminChapterId === bizChapterId);
      const namesMatch = Boolean(
        cleanAdminChapter &&
        cleanBizChapter &&
        (cleanAdminChapter === cleanBizChapter ||
          cleanAdminChapter.includes(cleanBizChapter) ||
          cleanBizChapter.includes(cleanAdminChapter))
      );

      if (!idsMatch && !namesMatch) {
        throw new ForbiddenError("You are not authorized to update remarks for this chapter.");
      }
    }

    const finalRemarks = String(remarks || "").trim();
    verification.remarks = finalRemarks;
    await verification.save();

    if (business) {
      business.verificationRemarks = finalRemarks;
      business.verificationReviewReason = finalRemarks;
      if (!Array.isArray(business.verificationHistory)) {
        business.verificationHistory = [];
      }
      business.verificationHistory.push({
        action: "remark_updated",
        reason: finalRemarks,
        reviewer: reviewer.id || reviewer,
        createdAt: new Date(),
      });
      await business.save();
    }

    return verification;
  },

  /**
   * Securely resolve document path for authorized users
   */
  getSecureDocumentPath: async (filename, requester) => {
    // Escape filename just in case
    const safeFilename = filename.replace(/[^a-zA-Z0-9.\-_]/g, "");
    
    // Find verification that contains this fileUrl
    const verification = await Verification.findOne({ 
      "documents.fileUrl": { $regex: safeFilename } 
    }).populate("business", "chapter");

    if (!verification) {
      throw new NotFoundError("Document not found");
    }

    // Role-based Access Control
    if (requester.role === ROLES.CHAPTER_ADMIN && requester.chapter) {
      const chapterRegex = new RegExp(`^${requester.chapter.trim()}$`, "i");
      if (!verification.business || !verification.business.chapter || !chapterRegex.test(verification.business.chapter)) {
        throw new ForbiddenError("You are not authorized to view documents for this chapter");
      }
    } else if (requester.role === ROLES.STATE_ADMIN && requester.state) {
      const stateRegex = new RegExp(`^${requester.state.trim()}$`, "i");
      if (!verification.business || (!stateRegex.test(verification.business.state || "") && !stateRegex.test(verification.business.chapter || ""))) {
        throw new ForbiddenError("You are not authorized to view documents outside your state");
      }
    } else if (requester.role !== ROLES.CENTRAL_ADMIN) {
      // If it's a business owner, they should only see their own
      // (This covers Business Owner panel access if they use this route)
      if (String(verification.submittedBy) !== String(requester.id)) {
         throw new ForbiddenError("You are not authorized to view this document");
      }
    }

    // Return the actual fileUrl stored in DB (e.g. "uploads/documents/xyz.pdf")
    const doc = verification.documents.find(d => d.fileUrl.includes(safeFilename));
    return doc.fileUrl;
  },

  /**
   * Delete an orphaned verification record
   */
  deleteVerification: async (verificationId, requester) => {
    const verification = await Verification.findById(verificationId).populate("business submittedBy");
    if (!verification) {
      throw new NotFoundError("Verification record not found");
    }

    if (![ROLES.CENTRAL_ADMIN, ROLES.CHAPTER_ADMIN, "admin", "super_admin"].includes(requester.role)) {
      throw new ForbiddenError("Only Administrators can delete orphaned verification records.");
    }

    // Ensure it is orphaned
    if (verification.business && verification.submittedBy) {
      throw new BadRequestError("This is not an orphaned record and cannot be deleted.");
    }

    await Verification.findByIdAndDelete(verificationId);
    return { success: true };
  },
};
