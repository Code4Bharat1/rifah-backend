import { membershipService } from "./membership.service.js";
import { businessService } from "../businesses/business.service.js";
import { User } from "../users/user.model.js";
import { Business } from "../businesses/business.model.js";
import { ROLES } from "../../shared/constants/roles.js";
import { generateSlug } from "../../shared/utils/generate-id.js";
import { asyncHandler } from "../../shared/utils/async-handler.js";
import { ApiResponse } from "../../shared/utils/response.js";
import { NotFoundError } from "../../shared/errors/errors.js";

export const membershipController = {
  getPlans: asyncHandler(async (req, res) => {
    const plans = await membershipService.getPlans();
    return ApiResponse.success(res, plans, "Membership plans retrieved");
  }),

  createPlan: asyncHandler(async (req, res) => {
    const plan = await membershipService.createPlan(req.body);
    return ApiResponse.created(res, plan, "Membership plan created");
  }),

  updatePlan: asyncHandler(async (req, res) => {
    const plan = await membershipService.updatePlan(req.params.planId, req.body);
    return ApiResponse.success(res, plan, "Membership plan updated");
  }),

  deletePlan: asyncHandler(async (req, res) => {
    await membershipService.deletePlan(req.params.planId);
    return ApiResponse.success(res, null, "Membership plan deleted");
  }),

  getMyMembership: asyncHandler(async (req, res) => {
    const business = await businessService.getBusinessByOwnerId(req.user.id);
    if (!business) {
      throw new NotFoundError("No business found for this account");
    }
    const membership = await membershipService.getMembershipByBusinessId(business._id);
    return ApiResponse.success(res, membership, "Membership details retrieved");
  }),

  upgradePlan: asyncHandler(async (req, res) => {
    const { planId } = req.body;
    let business = await businessService.getBusinessByOwnerId(req.user.id);
    if (!business) {
      const userDoc = await User.findById(req.user.id);
      if (userDoc) {
        if (userDoc.role === ROLES.CUSTOMER) {
          userDoc.role = ROLES.BUSINESS_OWNER;
          await userDoc.save();
        }
        const rawName = userDoc.organization || `${userDoc.name}'s Enterprise`;
        let slug = generateSlug(rawName);
        const slugConflict = await Business.findOne({ slug });
        if (slugConflict) slug = `${slug}-${Math.floor(1000 + Math.random() * 9000)}`;

        business = await Business.create({
          name: rawName,
          slug,
          owner: userDoc._id,
          city: userDoc.city || "Mumbai",
          state: userDoc.state || "Maharashtra",
          phone: userDoc.phone || "",
          email: userDoc.email || "",
          chapter: userDoc.chapter || "Mumbai Chapter",
          industry: "General Commerce",
          status: "Pending Verification",
          verificationStatus: "Pending",
          verification: "unverified",
          membership: "Basic",
          rating: 5,
        });
      } else {
        throw new NotFoundError("No business found for this account");
      }
    }
    const membership = await membershipService.upgradePlan(business._id, planId);
    return ApiResponse.success(res, membership, `Upgraded to ${membership.planName} tier successfully`);
  }),
};
