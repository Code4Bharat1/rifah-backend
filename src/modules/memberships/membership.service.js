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
    displayOrder: 1,
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
    displayOrder: 2,
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
    displayOrder: 3,
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
    displayOrder: 4,
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

    const CANONICAL_ORDER = { silver: 1, gold: 2, platinum: 3, diamond: 4 };
    plansArray.sort((a, b) => {
      const orderA = a.displayOrder && Number(a.displayOrder) > 0 ? Number(a.displayOrder) : (CANONICAL_ORDER[a.planId?.toLowerCase()] || null);
      const orderB = b.displayOrder && Number(b.displayOrder) > 0 ? Number(b.displayOrder) : (CANONICAL_ORDER[b.planId?.toLowerCase()] || null);
      if (orderA && orderB && orderA !== orderB) return orderA - orderB;
      if (orderA) return -1;
      if (orderB) return 1;
      return (Number(a.price) || 0) - (Number(b.price) || 0);
    });

    const plansMap = {};
    for (const plan of plansArray) {
      const key = plan.planId || plan._id?.toString();
      if (key) {
        const canonicalRank = CANONICAL_ORDER[plan.planId?.toLowerCase()] || 0;
        plansMap[key] = {
          _id: plan._id?.toString(),
          id: plan.planId || key,
          planId: plan.planId || key,
          name: plan.name,
          price: plan.price,
          priceUsd: plan.priceUsd,
          durationYears: plan.durationYears,
          gstRate: plan.gstRate,
          displayOrder: (plan.displayOrder && Number(plan.displayOrder) > 0) ? plan.displayOrder : canonicalRank,
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

    const business = await Business.findById(businessId);
    if (!business) {
      throw new NotFoundError("Business not found");
    }

    let membership = await Membership.findOne({ business: businessId });
    if (!membership) {
      membership = new Membership({ business: businessId });
    }

    // "Free" is the baseline, no-cost tier (BUG-025: "Free Basic plan" button in
    // Biz > Membership) — it isn't a purchasable catalog entry, so it must not
    // depend on a matching `Plan` document existing. The canonical plan catalog
    // (see DEFAULT_MEMBERSHIP_PLANS below: Silver/Gold/Platinum/Diamond) never
    // seeds a "free" Plan row, so looking it up via Plan.findOne always 404'd and
    // the activation silently failed. Handle it directly instead.
    if (planKey === "free") {
      membership.planId = "free";
      membership.planName = "Free";
      membership.price = 0;
      membership.billingCycle = "Free";
      membership.startDate = new Date();
      membership.endDate = null;
      membership.status = "Active";
      membership.features = [];
      membership.remindersSent = [];
      await membership.save();

      business.membership = "Free";
      await business.save();

      return membership;
    }

    const plan = await Plan.findOne({ planId: planKey, isActive: { $ne: false } }).lean();
    if (!plan) {
      throw new NotFoundError("Selected membership plan is unavailable");
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
        planId: { $ne: "free" },
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
        } else if (diffDays <= 2 && diffDays > 1) {
          milestone = "before_2";
        } else if (diffDays === 1) {
          milestone = "before_1";
        } else if (diffDays === 0) {
          milestone = "day_0";
        } else if (diffDays <= -2 && diffDays > -5) {
          milestone = "after_2";
        } else if (diffDays <= -5 && diffDays > -7) {
          milestone = "after_5";
        } else if (diffDays <= -7 && diffDays > -14) {
          milestone = "after_7";
        } else if (diffDays <= -14 && diffDays >= -30) {
          milestone = "after_14";
        }

        if (!milestone) continue;

        // Deduplication check: verify this milestone was not already sent for the current membership endDate
        membership.remindersSent = membership.remindersSent || [];
        const alreadySent = membership.remindersSent.some(
          (r) =>
            r.milestone === milestone &&
            r.forEndDate &&
            new Date(r.forEndDate).toDateString() === end.toDateString()
        );

        if (alreadySent) continue;

        const milestoneTitles = {
          before_30: "Membership Renewal Notice (30 Days Left)",
          before_15: "Upcoming Renewal: 15 Days Left",
          before_10: "Action Required: 10 Days Left",
          before_5: "Urgent: 5 Days Remaining for Membership",
          before_2: "Final Notice: 2 Days Left to Renew",
          before_1: "Last Day Tomorrow: Membership Expires Tomorrow",
          day_0: "Important: Your Membership Expires Today",
          after_2: "Grace Period: Membership Expired 2 Days Ago",
          after_5: "Urgent: 5 Days Since Membership Expiration",
          after_7: "Notice: 1 Week Since Membership Expiration",
          after_14: "Final Notice: 2 Weeks Since Membership Expiration",
        };

        const title = milestoneTitles[milestone] || "Membership Expiry Notice";

        try {
          // Send Email
          await emailService.sendMembershipExpiryReminderEmail({
            email: targetEmail,
            businessName: business.name || "Member Business",
            ownerName: business.owner?.name || business.contactPerson || "",
            planName: membership.planName || "Membership",
            endDate: membership.endDate,
            milestone,
            chapter: business.chapter || "",
          });

          // Send in-app notification to business owner
          if (business.owner?._id || business.owner) {
            const recipientId = business.owner._id || business.owner;
            await notificationService
              .createNotification({
                recipientId,
                type: "Membership",
                title,
                body: `Your RIFAH ${membership.planName || "Membership"} (${business.name}) requires renewal. Expiry date: ${end.toLocaleDateString("en-IN")}. Click to renew your subscription.`,
                link: "/biz/membership",
              })
              .catch(() => {});
          }

          // Record that this milestone was successfully sent
          membership.remindersSent.push({
            milestone,
            sentAt: new Date(),
            forEndDate: membership.endDate,
          });

          // If expired, update status to Expired
          if (diffDays < 0 && membership.status === "Active") {
            membership.status = "Expired";
          }

          // If 2 weeks past expiry, downgrade business membership to Free
          if (diffDays <= -14 && business.membership !== "Free") {
            business.membership = "Free";
            await business.save();
          }

          await membership.save();
          sentCount++;
          logger.info(
            `[MEMBERSHIP EXPIRY EMAIL SENT] Business: ${business.name} | Email: ${targetEmail} | Milestone: ${milestone} | DiffDays: ${diffDays}`
          );
        } catch (err) {
          logger.error(`Error sending membership reminder for ${business.name}: ${err.message}`);
        }
      }

      if (sentCount > 0) {
        logger.info(`Membership expiry scheduler sent ${sentCount} reminder notifications.`);
      }

      return { success: true, processedCount: memberships.length, sentCount };
    } catch (error) {
      logger.error("[MEMBERSHIP EXPIRY SCHEDULER ERROR]", error);
      return { success: false, error: error.message };
    }
  },

  /**
   * Starts periodic scheduler to check and send membership expiry reminder emails
   */
  startMembershipExpiryScheduler: () => {
    logger.info("[MEMBERSHIP SCHEDULER] Membership expiry reminder scheduler initialized.");

    // Initial check after 15 seconds of startup
    setTimeout(() => {
      membershipService.checkAndSendMembershipExpiryReminders().catch((err) => {
        logger.error("[MEMBERSHIP SCHEDULER] Initial run error:", err);
      });
    }, 15000);

    // Run periodically to check for milestone transitions
    setInterval(() => {
      membershipService.checkAndSendMembershipExpiryReminders().catch((err) => {
        logger.error("[MEMBERSHIP SCHEDULER] Periodic run error:", err);
      });
    }, 60 * 60 * 1000);
  },
};
