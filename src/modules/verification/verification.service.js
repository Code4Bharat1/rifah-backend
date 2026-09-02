import { Verification } from "./verification.model.js";
import { Business } from "../businesses/business.model.js";
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
  getVerificationByBusinessId: async (businessId) => {
    const verification = await Verification.findOne({ business: businessId })
      .populate("business", "name slug chapter")
      .populate("submittedBy", "name email");
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
    }

    if (queryParams.status) {
      filter.status = queryParams.status;
    }

    const [verifications, total] = await Promise.all([
      Verification.find(filter)
        .populate("business", "name slug city state chapter membership")
        .populate("submittedBy", "name email phone")
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
  reviewVerification: async (verificationId, { status, remarks }, reviewerId) => {
    const verification = await Verification.findById(verificationId);
    if (!verification) {
      throw new NotFoundError("Verification request not found");
    }

    verification.status = status;
    verification.remarks = remarks || "";
    verification.reviewedBy = reviewerId;
    verification.reviewedAt = new Date();
    await verification.save();

    // Update business profile verification status
    const business = await Business.findById(verification.business);
    if (business) {
      business.verification = status;
      await business.save();
    }

    return verification;
  },
};
