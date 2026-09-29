import { Business } from "../../modules/businesses/business.model.js";
import { User } from "../../modules/users/user.model.js";
import { NotFoundError, ForbiddenError, BadRequestError } from "../errors/errors.js";
import { ERROR_CODES } from "../errors/error-codes.js";

/**
 * Checks if a business has completed verification.
 * Businesses with pending verification, under review, or unverified status return false.
 */
export const isBusinessVerified = (business) => {
  if (!business) return false;

  const rawVerification = String(business.verification || business.verificationStatus || "").toLowerCase().trim();
  const rawStatus = String(business.status || "").toLowerCase().trim();

  // Explicitly pending, under review, unverified, or correction requested
  if (
    rawVerification === "pending" ||
    rawVerification === "under_review" ||
    rawVerification === "unverified" ||
    rawVerification === "correction_requested" ||
    rawStatus === "pending verification" ||
    rawStatus === "pending_verification" ||
    rawStatus === "pending" ||
    rawStatus === "draft"
  ) {
    return false;
  }

  // Must be verified or approved
  const isExplicitlyVerified =
    rawVerification === "verified" ||
    rawVerification === "approved" ||
    business.isVerified === true;

  return Boolean(isExplicitlyVerified);
};

/**
 * Resolves a Business by id and enforces that it is eligible to hold an
 * admin role (Chapter Admin, State Admin, Central Admin).
 * 
 * Enforces:
 *  - Business must exist and have an owner account.
 *  - Business must NOT be pending verification. It must have successfully completed verification.
 *  - Throws BUSINESS_VERIFICATION_PENDING with HTTP 400 before any allocation mutation can take place.
 */
export const resolveEligibleAdminBusiness = async (businessId) => {
  if (!businessId) {
    throw new ForbiddenError("Please select a business to assign as admin.");
  }

  const business = await Business.findById(businessId).populate("owner");
  if (!business) {
    throw new NotFoundError("Business not found");
  }

  // Verification Guard: Reject allocation if business is pending verification
  if (!isBusinessVerified(business)) {
    throw new BadRequestError(
      "This business is currently pending verification. It cannot be allocated to a State Admin or Chapter Admin until the verification process is completed.",
      null,
      ERROR_CODES.BUSINESS_VERIFICATION_PENDING
    );
  }

  if (!business.owner && (business.ownerEmail || business.email)) {
    const ownerEmail = (business.ownerEmail || business.email).toLowerCase().trim();
    const user = await User.findOne({ email: ownerEmail });
    if (user) {
      business.owner = user;
    }
  }

  if (!business.owner) {
    throw new ForbiddenError("This business has no owner account and cannot be assigned as admin.");
  }

  return business;
};
