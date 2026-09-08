import { Membership } from "./membership.model.js";
import { Plan } from "./plan.model.js";
import { Business } from "../businesses/business.model.js";
import { NotFoundError } from "../../shared/errors/errors.js";
import { addDays } from "../../shared/utils/date.js";

export const membershipService = {
  getPlans: async () => {
    let plansArray = [];
    try {
      plansArray = await Plan.find().lean();
    } catch (e) {
      console.error("Error fetching plans from DB:", e);
    }
    const plansMap = {};
    for (const plan of plansArray) {
      const key = plan.planId || plan._id?.toString();
      if (key) {
        plansMap[key] = {
          name: plan.name,
          price: plan.price,
          priceUsd: plan.priceUsd || (plan.price === 0 ? 0 : Math.round(plan.price / 80)),
          summary: plan.summary,
          features: plan.features,
        };
      }
    }
    if (Object.keys(plansMap).length === 0) {
      return {
        free: { name: "Free", price: 0, priceUsd: 0, summary: "Get started on RIFAH Connect", features: ["Directory listing", "Basic search", "5 leads / mo"] },
        basic: { name: "Basic", price: 4999, priceUsd: 59, summary: "For growing businesses", features: ["Directory listing", "Verified badge", "15 leads / mo", "Direct buyer messaging"] },
        premium: { name: "Premium", price: 12999, priceUsd: 159, summary: "For established businesses", features: ["Featured listing", "Verified badge", "Unlimited leads", "Chamber event passes", "RFQ priority"] },
        enterprise: { name: "Enterprise", price: 29999, priceUsd: 359, summary: "For market leaders", features: ["All Premium features", "Secretariat advisory", "Global chapter access", "Custom expo pavilion"] },
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
