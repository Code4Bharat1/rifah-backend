import { Business } from "../../modules/businesses/business.model.js";
import { NotFoundError, ForbiddenError } from "../errors/errors.js";

const VERIFIED_VALUES = ["verified", "Verified", "approved", "Approved"];

/**
 * Resolves a Business by id and enforces that it is eligible to hold an
 * admin role (Chapter Admin, State Admin, Central Admin): the business must
 * have an active paid membership and be verified by the secretariat. This is
 * the single gate every admin-assignment path must go through so a fresh,
 * unpaid, unverified account can never become an admin.
 */
export const resolveEligibleAdminBusiness = async (businessId) => {
  if (!businessId) {
    throw new ForbiddenError("Please select a business to assign as admin.");
  }

  const business = await Business.findById(businessId).populate("owner");
  if (!business) {
    throw new NotFoundError("Business not found");
  }
  if (!business.owner) {
    throw new ForbiddenError("This business has no owner account and cannot be assigned as admin.");
  }

  const isPaid = business.isPaid === true && business.membership && business.membership !== "Free";
  if (!isPaid) {
    throw new ForbiddenError("Only businesses with an active paid membership can be assigned as an admin.");
  }

  const isVerified = VERIFIED_VALUES.includes(business.verification);
  if (!isVerified) {
    throw new ForbiddenError("Only verified businesses can be assigned as an admin.");
  }

  return business;
};
