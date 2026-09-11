import { Verification } from "./verification.model.js";
import { Business } from "../businesses/business.model.js";
import { User } from "../users/user.model.js";
import { emailService } from "../../infrastructure/email/email.service.js";
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
    await business.save();

    return verification;
  },

  /**
   * Get verification status for a business
   */
  getVerificationByBusinessId: async (businessId, requester = null) => {
    const verification = await Verification.findOne({ business: businessId })
      .populate("business", "name slug chapter verification verificationReviewReason verificationRemarks verificationHistory")
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

    if (queryParams.chapter && queryParams.chapter.toLowerCase() !== "all" && !chapterScope.business) {
      const chapterRegex = new RegExp(`^${queryParams.chapter.trim()}$`, "i");
      const chapterBusinesses = await Business.find({ chapter: chapterRegex }).select('_id');
      const businessIds = chapterBusinesses.map(b => b._id);
      filter.business = { $in: businessIds };
    }

    if (queryParams.status) {
      filter.status = queryParams.status;
    }

    const [verifications, total] = await Promise.all([
      Verification.find(filter)
        .populate("business", "name slug city state chapter membership verification verificationReviewReason")
        .populate("submittedBy", "name email phone")
        .populate("reviewedBy", "name chapter role")
        .sort(sort)
        .skip(skip)
        .limit(limit),
      Verification.countDocuments(filter),
    ]);

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
    
    // RBAC: Chapter Admin Scope Enforcement
    if (reviewer && reviewer.role === ROLES.CHAPTER_ADMIN && reviewer.chapter) {
      const chapterRegex = new RegExp(`^${reviewer.chapter.trim()}$`, "i");
      if (business && business.chapter && !chapterRegex.test(business.chapter)) {
        throw new ForbiddenError("You are not authorized to review verifications for this chapter");
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
        } catch (err) {
          console.error("Failed to send verification status email:", err);
        }
      }
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
    } else if (requester.role !== ROLES.SUPER_ADMIN && requester.role !== ROLES.SECRETARIAT) {
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
};
