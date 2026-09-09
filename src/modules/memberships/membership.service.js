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
    const business = await Business.findById(businessId);
    let membership = await Membership.findOne({ business: businessId });
    
    if (!membership) {
      // If no membership record exists, sync with business tier or default to free
      const bizTier = (business?.membership || "free").toLowerCase();
      const plan = await Plan.findOne({ planId: bizTier }).lean() || 
                   await Plan.findOne({ planId: "free" }).lean() || 
                   { name: business?.membership || "Free", price: 0, features: [] };
      
      membership = await Membership.create({
        business: businessId,
        planId: bizTier,
        planName: plan.name || business?.membership || "Free",
        price: plan.price || 0,
        startDate: business?.createdAt || new Date(),
        endDate: addDays(365),
        status: "Active",
        features: plan.features || [],
      });
    }

    const now = new Date();
    // Check if membership is expired
    if (membership.endDate && new Date(membership.endDate) < now) {
      if (membership.status === "Active" && membership.planId !== "free") {
        membership.status = "Expired";
        await membership.save();
        if (business && business.membership !== "Free") {
          business.membership = "Free";
          await business.save();
        }
      }
    }

    const membershipObj = membership.toObject ? membership.toObject() : { ...membership };
    const endDate = membership.endDate ? new Date(membership.endDate) : null;
    const diffMs = endDate ? endDate.getTime() - now.getTime() : 0;
    const daysRemaining = Math.max(0, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));

    membershipObj.daysRemaining = daysRemaining;
    membershipObj.isExpiringSoon = membership.status === "Active" && membership.planId !== "free" && daysRemaining <= 15 && daysRemaining > 0;
    membershipObj.isExpired = membership.status === "Expired" || (endDate && endDate < now && membership.planId !== "free");

    return membershipObj;
  },

  upgradePlan: async (businessId, planId) => {
    const planKey = (planId || "free").toLowerCase();
    let plan = await Plan.findOne({ planId: planKey }).lean();
    if (!plan) {
      const fallbackPlans = {
        free: { name: "Free", price: 0, summary: "Get started on RIFAH Connect", features: ["Directory listing", "Basic search", "5 leads / mo"] },
        basic: { name: "Basic", price: 4999, summary: "For growing businesses", features: ["Directory listing", "Verified badge", "15 leads / mo", "Direct buyer messaging"] },
        premium: { name: "Premium", price: 12999, summary: "For established businesses", features: ["Featured listing", "Verified badge", "Unlimited leads", "Chamber event passes", "RFQ priority"] },
        enterprise: { name: "Enterprise", price: 29999, summary: "For market leaders", features: ["All Premium features", "Secretariat advisory", "Global chapter access", "Custom expo pavilion"] },
      };
      plan = fallbackPlans[planKey] || { name: planId, price: 0, features: [] };
    }

    const business = await Business.findById(businessId);
    if (!business) {
      throw new NotFoundError("Business not found");
    }

    let membership = await Membership.findOne({ business: businessId });
    if (!membership) {
      membership = new Membership({ business: businessId });
    }

    membership.planId = planKey;
    membership.planName = plan.name;
    membership.price = plan.price || 0;
    membership.startDate = new Date();
    membership.endDate = addDays(365);
    membership.status = "Active";
    membership.features = plan.features || [];
    await membership.save();

    business.membership = plan.name;
    await business.save();

    return membership;
  },
};
