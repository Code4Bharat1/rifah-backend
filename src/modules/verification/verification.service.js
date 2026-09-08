import { Verification } from "./verification.model.js";
import { Business } from "../businesses/business.model.js";
import { User } from "../users/user.model.js";
import { emailService } from "../../infrastructure/email/email.service.js";
import { NotFoundError, BadRequestError, ForbiddenError } from "../../shared/errors/errors.js";
import { parsePagination, buildPaginationMeta } from "../../shared/utils/pagination.js";
import { ROLES } from "../../shared/constants/roles.js";

export const verificationService = {
  /**
   * Submit verification request with documents
   */
  submitVerification: async (businessId, documents, user) => {
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
      await verification.save();
    } else {
      verification = await Verification.create({
        business: businessId,
        submittedBy: user.id,
        documents,
        status: "pending",
      });
    }

    business.verification = "pending";
    await business.save();

    return verification;
  },

  /**
   * Get verification status for a business
   */
  getVerificationByBusinessId: async (businessId, requester = null) => {
    const verification = await Verification.findOne({ business: businessId })
      .populate("business", "name slug chapter")
      .populate("submittedBy", "name email");

    if (!verification) return null;

    if (requester && requester.role === ROLES.CHAPTER_ADMIN) {
      if (verification.business && verification.business.chapter !== requester.chapter) {
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
    if (requester && requester.role === ROLES.CHAPTER_ADMIN) {
      const chapterBusinesses = await Business.find({ chapter: requester.chapter }).select('_id');
      const businessIds = chapterBusinesses.map(b => b._id);
      filter.business = { $in: businessIds };
    } else if (queryParams.chapter && queryParams.chapter.toLowerCase() !== "all") {
      // Super Admin explicit chapter filter
      const chapterBusinesses = await Business.find({ chapter: queryParams.chapter }).select('_id');
      const businessIds = chapterBusinesses.map(b => b._id);
      filter.business = { $in: businessIds };
    }

    if (queryParams.status) {
      filter.status = queryParams.status;
    }

    const [verifications, total] = await Promise.all([
      Verification.find(filter)
        .populate("business", "name slug city state chapter membership")
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
  reviewVerification: async (verificationId, { status, remarks }, reviewer) => {
    const verification = await Verification.findById(verificationId);
    if (!verification) {
      throw new NotFoundError("Verification request not found");
    }

    const business = await Business.findById(verification.business);
    
    // RBAC: Chapter Admin Scope Enforcement
    if (reviewer && reviewer.role === ROLES.CHAPTER_ADMIN) {
      if (business && business.chapter !== reviewer.chapter) {
        throw new ForbiddenError("You are not authorized to review verifications for this chapter");
      }
    }

    let finalStatus = status;
    if (status === "approved") finalStatus = "verified";
    if (status === "correction") finalStatus = "correction_requested";

    verification.status = finalStatus;
    if (remarks) verification.remarks = remarks;
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

    // Update business profile verification status
    if (business) {
      business.verification = finalStatus;
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
              notes: remarks,
            });
          }
        } catch (err) {}
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
    if (requester.role === ROLES.CHAPTER_ADMIN) {
      if (!verification.business || verification.business.chapter !== requester.chapter) {
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
