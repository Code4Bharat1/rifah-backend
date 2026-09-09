import { membershipService } from "./membership.service.js";
import { businessService } from "../businesses/business.service.js";
import { User } from "../users/user.model.js";
import { Business } from "../businesses/business.model.js";
import { ROLES } from "../../shared/constants/roles.js";
import { generateSlug } from "../../shared/utils/generate-id.js";
import { asyncHandler } from "../../shared/utils/async-handler.js";
import { ApiResponse } from "../../shared/utils/response.js";
import { NotFoundError } from "../../shared/errors/errors.js";
import { auditService } from "../audit/audit.service.js";

export const membershipController = {
  getPlans: asyncHandler(async (req, res) => {
    const plans = await membershipService.getPlans();
    return ApiResponse.success(res, plans, "Membership plans retrieved");
  }),

  createPlan: asyncHandler(async (req, res) => {
    const plan = await membershipService.createPlan(req.body);
    await auditService.logAction({
      actor: req.user,
      action: "CREATE",
      targetModel: "Plan",
      targetId: plan._id,
      summary: `Created new membership plan: ${plan.name}`,
      ipAddress: req.ip
    });
    return ApiResponse.created(res, plan, "Membership plan created");
  }),

  updatePlan: asyncHandler(async (req, res) => {
    const plan = await membershipService.updatePlan(req.params.planId, req.body);
    await auditService.logAction({
      actor: req.user,
      action: "UPDATE",
      targetModel: "Plan",
      targetId: plan._id,
      summary: `Updated membership plan: ${plan.name}`,
      ipAddress: req.ip
    });
    return ApiResponse.success(res, plan, "Membership plan updated");
  }),

  deletePlan: asyncHandler(async (req, res) => {
    await membershipService.deletePlan(req.params.planId);
    await auditService.logAction({
      actor: req.user,
      action: "DELETE",
      targetModel: "Plan",
      targetId: req.params.planId,
      summary: `Deleted membership plan: ${req.params.planId}`,
      ipAddress: req.ip
    });
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

        const bizCity = userDoc.city || "";
        const bizState = userDoc.state || "";
        const bizChapter = userDoc.chapter || "";
        const bizIndustry = userDoc.sourcingInterest || "";

        business = await Business.create({
          name: rawName,
          slug,
          owner: userDoc._id,
          city: bizCity,
          state: bizState,
          phone: userDoc.phone || "",
          email: userDoc.email || "",
          chapter: bizChapter,
          industry: bizIndustry,
          categories: bizIndustry ? [bizIndustry] : [],
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
