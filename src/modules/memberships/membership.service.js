import { Membership } from "./membership.model.js";
import { Plan } from "./plan.model.js";
import { Business } from "../businesses/business.model.js";
import { NotFoundError } from "../../shared/errors/errors.js";
import { addDays } from "../../shared/utils/date.js";
import { emailService } from "../../infrastructure/email/email.service.js";
import { notificationService } from "../notifications/notification.service.js";
import { logger } from "../../infrastructure/logger/logger.js";

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
        enterprise: { name: "Enterprise", price: 29999, priceUsd: 359, summary: "For market leaders", features: ["All Premium features", "Central Admin advisory", "Global chapter access", "Custom expo pavilion"] },
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
        enterprise: { name: "Enterprise", price: 29999, summary: "For market leaders", features: ["All Premium features", "Central Admin advisory", "Global chapter access", "Custom expo pavilion"] },
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
              type: "System",
              title,
              body: `Your RIFAH ${membership.planName} membership (${business.name}) requires renewal. Expiry date: ${end.toLocaleDateString("en-IN")}. Click to renew your subscription.`,
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
      }

      return { success: true, processedCount: memberships.length, sentCount };
    } catch (error) {
      logger.error("[MEMBERSHIP EXPIRY SCHEDULER ERROR]", error);
      return { success: false, error: error.message };
    }
  },

  /**
   * Starts periodic scheduler to check and send membership expiry reminder emails hourly
   */
  startMembershipExpiryScheduler: () => {
    // Initial check after 15 seconds of startup
    setTimeout(() => {
      membershipService.checkAndSendMembershipExpiryReminders().catch(() => {});
    }, 15000);

    // Run hourly to check for milestone transitions
    setInterval(() => {
      membershipService.checkAndSendMembershipExpiryReminders().catch(() => {});
    }, 60 * 60 * 1000);

    logger.info("[MEMBERSHIP SCHEDULER] Membership expiry reminder hourly scheduler started.");
  },
};
