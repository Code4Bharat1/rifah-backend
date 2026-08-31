import { Membership } from "./membership.model.js";
import { Business } from "../businesses/business.model.js";
import { NotFoundError } from "../../shared/errors/errors.js";
import { addDays } from "../../shared/utils/date.js";

const PLANS = {
  free: { name: "Free", price: 0, features: ["Directory listing", "Basic search", "5 leads / mo"] },
  basic: { name: "Basic", price: 4999, features: ["Directory listing", "Verified badge", "15 leads / mo", "Direct buyer messaging"] },
  premium: { name: "Premium", price: 12999, features: ["Featured listing", "Verified badge", "Unlimited leads", "Chamber event passes", "RFQ priority"] },
  enterprise: { name: "Enterprise", price: 29999, features: ["All Premium features", "Secretariat advisory", "Global chapter access", "Custom expo pavilion"] },
};

export const membershipService = {
  getPlans: () => {
    return PLANS;
  },

  getMembershipByBusinessId: async (businessId) => {
    let membership = await Membership.findOne({ business: businessId });
    if (!membership) {
      // Default to free
      membership = await Membership.create({
        business: businessId,
        planId: "free",
        planName: "Free",
        price: 0,
        startDate: new Date(),
        endDate: addDays(365),
        status: "Active",
        features: PLANS.free.features,
      });
    }
    return membership;
  },

  upgradePlan: async (businessId, planId) => {
    const plan = PLANS[planId];
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
