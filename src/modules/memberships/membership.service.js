import { Membership } from "./membership.model.js";
import { Plan } from "./plan.model.js";
import { Business } from "../businesses/business.model.js";
import { NotFoundError } from "../../shared/errors/errors.js";
import { addDays } from "../../shared/utils/date.js";

export const membershipService = {
  getPlans: async () => {
    const plansArray = await Plan.find().lean();
    const plansMap = {};
    for (const plan of plansArray) {
      plansMap[plan.planId] = {
        name: plan.name,
        price: plan.price,
        summary: plan.summary,
        features: plan.features
      };
    }
    return plansMap;
  },

  createPlan: async (data) => {
    return await Plan.create(data);
  },

  updatePlan: async (planId, data) => {
    const plan = await Plan.findOneAndUpdate({ planId }, data, { new: true, runValidators: true });
    if (!plan) throw new NotFoundError("Plan not found");
    return plan;
  },

  deletePlan: async (planId) => {
    const plan = await Plan.findOneAndDelete({ planId });
    if (!plan) throw new NotFoundError("Plan not found");
    return plan;
  },

  getMembershipByBusinessId: async (businessId) => {
    let membership = await Membership.findOne({ business: businessId });
    if (!membership) {
      // Default to free
      const freePlan = await Plan.findOne({ planId: "free" }).lean() || { name: "Free", price: 0, features: [] };
      membership = await Membership.create({
        business: businessId,
        planId: "free",
        planName: freePlan.name,
        price: freePlan.price,
        startDate: new Date(),
        endDate: addDays(365),
        status: "Active",
        features: freePlan.features,
      });
    }
    return membership;
  },

  upgradePlan: async (businessId, planId) => {
    const plan = await Plan.findOne({ planId }).lean();
    if (!plan) {
      throw new NotFoundError("Plan not found");
    }

    const business = await Business.findById(businessId);
    if (!business) {
      throw new NotFoundError("Business not found");
    }

    let membership = await Membership.findOne({ business: businessId });
    if (!membership) {
      membership = new Membership({ business: businessId });
    }

    membership.planId = planId;
    membership.planName = plan.name;
    membership.price = plan.price;
    membership.startDate = new Date();
    membership.endDate = addDays(365);
    membership.status = "Active";
    membership.features = plan.features;
    await membership.save();

    business.membership = plan.name;
    await business.save();

    return membership;
  },
};
