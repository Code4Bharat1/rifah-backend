import { Business } from "../businesses/business.model.js";
import { BadRequestError, NotFoundError } from "../../shared/errors/errors.js";

/**
 * Resolves the calling user's own business profile, required to log any
 * networking record (a one-to-one meeting or a thank-you note).
 */
export const resolveOwnBusiness = async (userId) => {
  const business = await Business.findOne({ owner: userId });
  if (!business) {
    throw new BadRequestError("You must have a registered business profile to use Networking features.");
  }
  if (!business.chapterId || !business.state) {
    throw new BadRequestError("Your business profile is missing chapter/state information. Please complete your profile first.");
  }
  return business;
};

/**
 * Resolves the selected fellow member's business profile.
 */
export const resolveMemberBusiness = async (businessId) => {
  const business = await Business.findById(businessId);
  if (!business) {
    throw new NotFoundError("Selected member's business could not be found.");
  }
  if (!business.chapterId || !business.state) {
    throw new BadRequestError("Selected member's business profile is missing chapter/state information.");
  }
  return business;
};
