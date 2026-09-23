import mongoose from "mongoose";
import { Membership } from "./membership.model.js";
import { Plan } from "./plan.model.js";
import { Business } from "../businesses/business.model.js";
import { NotFoundError, BadRequestError } from "../../shared/errors/errors.js";
import { addDays } from "../../shared/utils/date.js";
import { emailService } from "../../infrastructure/email/email.service.js";
import { notificationService } from "../notifications/notification.service.js";
import { logger } from "../../infrastructure/logger/logger.js";
import { User } from "../users/user.model.js";
import { ROLES } from "../../shared/constants/roles.js";

export const DEFAULT_MEMBERSHIP_PLANS = {
  silver: {
    name: "Silver",
    price: 3000,
    priceUsd: 39,
    durationYears: 1,
    gstRate: 18,
    isRecommended: false,
    summary: "1-Year Verified Chamber Membership",
    features: [
      "Directory listing with Verified Chamber Badge",
      "Up to 15 matched buyer lead enquiries / mo",
      "Standard catalogue listing (up to 5 items)",
      "Chamber community & chapter networking access",
    ],
    missingFeatures: [
      "Direct B2B buyer messaging",
      "Priority RFQ & high-value lead routing",
      "Chamber summit & event delegate passes",
      "Secretariat & Trade Advisory Desk",
      "Global Chapter & International Network Access",
      "Custom expo pavilion & sponsor showcase",
    ],
  },
  gold: {
    name: "Gold",
    price: 5000,
    priceUsd: 65,
    durationYears: 2,
    gstRate: 18,
    isRecommended: false,
    summary: "2-Year Chamber Access & Direct Messaging",
    features: [
      "Directory listing with Verified Chamber Badge",
      "Up to 35 matched buyer lead enquiries / mo",
      "Expanded catalogue listing (up to 15 items)",
      "Direct B2B buyer messaging",
      "Priority RFQ & high-value lead routing",
    ],
    missingFeatures: [
      "Chamber summit & event delegate passes",
      "Secretariat & Trade Advisory Desk",
      "Global Chapter & International Network Access",
      "Custom expo pavilion & sponsor showcase",
    ],
  },
  platinum: {
    name: "Platinum",
    price: 25000,
    priceUsd: 325,
    durationYears: 10,
    gstRate: 18,
    isRecommended: true,
    summary: "10-Year Enterprise Patronage (Recommended)",
    features: [
      "Featured placement across Directory & Homepage",
      "Unlimited matched buyer lead enquiries",
      "Full commercial product & service catalogue",
      "Direct B2B buyer messaging",
      "Priority RFQ & high-value lead routing",
      "4 Annual Chamber Summit & Networking delegate passes",
      "Secretariat & Trade Advisory Desk",
    ],
    missingFeatures: [
      "Global Chapter & International Network Access",
      "Custom expo pavilion & sponsor showcase",
    ],
  },
  diamond: {
    name: "Diamond",
    price: 50000,
    priceUsd: 650,
    durationYears: 25,
    gstRate: 18,
    isRecommended: false,
    summary: "25-Year Prestige Chamber Patronage",
    features: [
      "All Platinum features included",
      "25-Year Lifetime chamber patronage",
      "Unlimited verified buyer lead enquiries",
      "Full commercial product & service catalogue",
      "Direct B2B buyer messaging",
      "Priority RFQ & high-value lead routing",
      "VIP Delegate passes for national & regional summits",
      "Dedicated Secretariat Trade Advisory Desk",
      "Global Chapter & International Network Access",
      "Custom exhibition pavilion & sponsor showcase",
    ],
    missingFeatures: [],
  },
};

export const membershipService = {
  getPlans: async () => {
    let plansArray = await Plan.find().sort({ displayOrder: 1, createdAt: 1 }).lean();

    // Seed defaults only for a brand-new database. Never replace plans an admin has
    // already created or edited.
    if (plansArray.length === 0) {
      for (const [id, data] of Object.entries(DEFAULT_MEMBERSHIP_PLANS)) {
        await Plan.create({ planId: id, ...data });
      }
      plansArray = await Plan.find().sort({ displayOrder: 1, createdAt: 1 }).lean();
    }

    const plansMap = {};
    for (const plan of plansArray) {
      const key = plan.planId || plan._id?.toString();
      if (key) {
        plansMap[key] = {
          _id: plan._id?.toString(),
          id: plan.planId || key,
          planId: plan.planId || key,
          name: plan.name,
          price: plan.price,
          priceUsd: plan.priceUsd,
          durationYears: plan.durationYears,
          gstRate: plan.gstRate,
          displayOrder: plan.displayOrder,
          isActive: plan.isActive !== false,
          isRecommended: Boolean(plan.isRecommended),
          summary: plan.summary || "",
          features: Array.isArray(plan.features) ? plan.features : [],
          missingFeatures: Array.isArray(plan.missingFeatures) ? plan.missingFeatures : [],
        };
      }
    }

    return plansMap;
  },

  createPlan: async (data) => {
    const rawId = (data.planId || data.name || "").toLowerCase().trim().replace(/[^a-z0-9_-]/g, "-");
    if (!rawId) throw new BadRequestError("A valid Plan ID is required");

    const existing = await Plan.findOne({
      $or: [
        { planId: rawId },
        { name: { $regex: new RegExp(`^${data.name?.trim()}$`, "i") } }
      ]
    });
    if (existing) {
      throw new BadRequestError(`A membership plan with ID "${rawId}" or name "${data.name}" already exists`);
    }

    return await Plan.create({
      ...data,
      planId: rawId,
    });
  },

  updatePlan: async (planId, data) => {
    const cleanId = String(planId || "").trim();
    const query = {
      $or: [
        { planId: cleanId.toLowerCase() },
        { planId: cleanId },
        ...(mongoose.Types.ObjectId.isValid(cleanId) ? [{ _id: cleanId }] : [])
      ]
    };

    let plan = await Plan.findOneAndUpdate(query, data, { new: true, runValidators: true });

    // Fallback: If not found in DB but exists in default fallback config, create it now!
    if (!plan && DEFAULT_MEMBERSHIP_PLANS[cleanId.toLowerCase()]) {
      const defaultData = DEFAULT_MEMBERSHIP_PLANS[cleanId.toLowerCase()];
      plan = await Plan.create({
        planId: cleanId.toLowerCase(),
        ...defaultData,
        ...data,
      });
    }

    if (!plan) throw new NotFoundError("Plan not found");
    return plan;
  },

  deletePlan: async (planId) => {
    const cleanId = String(planId || "").trim();
    const query = {
      $or: [
        { planId: cleanId.toLowerCase() },
        { planId: cleanId },
        ...(mongoose.Types.ObjectId.isValid(cleanId) ? [{ _id: cleanId }] : [])
      ]
    };
    const plan = await Plan.findOneAndDelete(query);
    if (!plan) throw new NotFoundError("Plan not found");
    return plan;
  },

  getMembershipByBusinessId: async (businessId) => {
    const business = await Business.findById(businessId);
    let membership = await Membership.findOne({ business: businessId });
    
    if (!membership) {
      // If no membership record exists, sync with business tier or default to Silver
      const bizTier = (business?.membership || "Silver").toLowerCase();
      const plan = await Plan.findOne({ planId: bizTier }).lean() || 
                   DEFAULT_MEMBERSHIP_PLANS[bizTier] || 
                   DEFAULT_MEMBERSHIP_PLANS.silver;
      
      const durationYears = plan.durationYears || 1;
      membership = await Membership.create({
        business: businessId,
        planId: bizTier,
        planName: plan.name || "Silver",
        price: plan.price || 3000,
        billingCycle: `${durationYears} Year${durationYears > 1 ? "s" : ""}`,
        startDate: business?.createdAt || new Date(),
        endDate: addDays(365 * durationYears),
        status: "Active",
        features: plan.features || [],
      });
    }

    const now = new Date();
    // Check if membership is expired
    if (membership.endDate && new Date(membership.endDate) < now) {
      if (membership.status === "Active") {
        membership.status = "Expired";
        await membership.save();
      }
    }

    const membershipObj = membership.toObject ? membership.toObject() : { ...membership };
    const endDate = membership.endDate ? new Date(membership.endDate) : null;
    const diffMs = endDate ? endDate.getTime() - now.getTime() : 0;
    const daysRemaining = Math.max(0, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));

    membershipObj.daysRemaining = daysRemaining;
    membershipObj.isExpiringSoon = membership.status === "Active" && daysRemaining <= 30 && daysRemaining > 0;
    membershipObj.isExpired = membership.status === "Expired" || (endDate && endDate < now);

    return membershipObj;
  },

  upgradePlan: async (businessId, planId) => {
    const planKey = (planId || "silver").toLowerCase();
    const plan = await Plan.findOne({ planId: planKey, isActive: { $ne: false } }).lean();
    if (!plan) {
      throw new NotFoundError("Selected membership plan is unavailable");
    }

    const business = await Business.findById(businessId);
    if (!business) {
      throw new NotFoundError("Business not found");
    }

    let membership = await Membership.findOne({ business: businessId });
    if (!membership) {
      membership = new Membership({ business: businessId });
    }

    const durationYears = Number(plan.durationYears) || 1;

    membership.planId = planKey;
    membership.planName = plan.name;
    membership.price = plan.price || 0;
    membership.billingCycle = `${durationYears} Year${durationYears > 1 ? "s" : ""}`;
    membership.startDate = new Date();
    membership.endDate = addDays(365 * durationYears);
    membership.status = "Active";
    membership.features = plan.features || [];
    membership.remindersSent = []; // Reset reminders for the new cycle
    await membership.save();

    business.membership = plan.name;
    await business.save();

    return membership;
  },

  /**
   * Scans all memberships and sends automated reminder emails for all lifecycle milestones:
   * - 30 days before (1 month)
   * - 15 days before
   * - 10 days before
   * - 5 days before
   * - 2 days before
   * - 1 day before
   * - 0 days (day of expiration)
   * - 2 days after expiration
   * - 5 days after expiration
   * - 7 days (1 week) after expiration
   * - 14 days (2 weeks) after expiration
   */
  checkAndSendMembershipExpiryReminders: async () => {
    try {
      const memberships = await Membership.find({
        endDate: { $exists: true, $ne: null },
      }).populate({
        path: "business",
        select: "name email ownerEmail contactPerson chapter phone owner membership",
        populate: {
          path: "owner",
          select: "name email phone",
        },
      });

      const now = new Date();
      const todayMidnight = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
      const msPerDay = 24 * 60 * 60 * 1000;

      let sentCount = 0;

      for (const membership of memberships) {
        const business = membership.business;
        if (!business) continue;

        const targetEmail = business.email || business.ownerEmail || business.owner?.email;
        if (!targetEmail) continue;

        const end = new Date(membership.endDate);
        const targetMidnight = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate()));
        const diffDays = Math.round((targetMidnight.getTime() - todayMidnight.getTime()) / msPerDay);

        // Determine applicable milestone according to requirements
        let milestone = null;
        if (diffDays <= 30 && diffDays > 15) {
          milestone = "before_30";
        } else if (diffDays <= 15 && diffDays > 10) {
          milestone = "before_15";
        } else if (diffDays <= 10 && diffDays > 5) {
          milestone = "before_10";
        } else if (diffDays <= 5 && diffDays > 2) {
          milestone = "before_5";
        } else if (diffDays === 2) {
          milestone = "before_2";
        } else if (diffDays === 1) {
          milestone = "before_1";
        } else if (diffDays === 0) {
          milestone = "on_expiry";
        } else if (diffDays === -2) {
          milestone = "after_2";
        } else if (diffDays === -5) {
          milestone = "after_5";
        } else if (diffDays === -7) {
          milestone = "after_7";
        } else if (diffDays === -14) {
          milestone = "after_14";
        }

        if (!milestone) continue;

        // Check if reminder for this milestone on the current membership end-date has already been sent
        const alreadySent = membership.remindersSent?.some(
          (r) => r.milestone === milestone && r.forEndDate?.getTime() === end.getTime()
        );
        if (alreadySent) continue;

        // Compose and dispatch the lifecycle reminder email
        try {
          const formattedEndDate = end.toLocaleDateString("en-IN", {
            day: "numeric",
            month: "short",
            year: "numeric",
          });

          await emailService.sendMembershipLifecycleEmail({
            email: targetEmail,
            name: business.contactPerson || business.owner?.name || "Valued Member",
            businessName: business.name,
            planName: membership.planName || "Chamber",
            expiryDate: formattedEndDate,
            milestone,
            diffDays,
            renewUrl: `http://localhost:3000/biz/membership?plan=${membership.planId || "silver"}`,
          });

          // In-app notification for the business owner
          if (business.owner?._id) {
            let notifTitle = "Membership Renewal Notice";
            let notifBody = `Your ${membership.planName} tier membership expires on ${formattedEndDate}.`;
            if (diffDays < 0) {
              notifTitle = "Membership Expired";
              notifBody = `Your ${membership.planName} tier membership expired on ${formattedEndDate}. Please renew to maintain verified directory status.`;
            } else if (diffDays === 0) {
              notifTitle = "Membership Expires Today";
              notifBody = `Your ${membership.planName} tier membership expires today.`;
            }

            await notificationService.createNotification({
              recipientId: business.owner._id,
              type: "Membership",
              title: notifTitle,
              body: notifBody,
              link: "/biz/membership",
            }).catch(() => {});
          }

          membership.remindersSent.push({
            milestone,
            sentAt: new Date(),
            forEndDate: end,
          });
          await membership.save();
          sentCount++;
        } catch (err) {
          logger.error(`Error sending membership reminder for ${business.name}: ${err.message}`);
        }
      }

      if (sentCount > 0) {
        logger.info(`Membership expiry scheduler sent ${sentCount} reminder notifications.`);
      }
    } catch (err) {
      logger.error(`Membership expiry scheduler error: ${err.message}`);
    }
  },

  /**
   * Initializes the cron scheduler to scan daily at 00:05 UTC
   */
  startMembershipExpiryScheduler: () => {
    logger.info("Membership expiry scheduler initialized (Checking lifecycle daily).");
    membershipService.checkAndSendMembershipExpiryReminders();
    setInterval(() => {
      membershipService.checkAndSendMembershipExpiryReminders();
    }, 24 * 60 * 60 * 1000);
  },
};
