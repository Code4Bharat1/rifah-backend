import mongoose from "mongoose";
import { User } from "../../modules/users/user.model.js";
import { Business } from "../../modules/businesses/business.model.js";
import { Membership } from "../../modules/memberships/membership.model.js";
import { Catalogue } from "../../modules/catalogue/catalogue.model.js";
import { Post } from "../../modules/posts/post.model.js";
import { Message } from "../../modules/messages/message.model.js";
import { Enquiry } from "../../modules/enquiries/enquiry.model.js";
import { Lead } from "../../modules/leads/lead.model.js";
import { OneToOne } from "../../modules/networking/one-to-one.model.js";

/**
 * Authoritative 33-feature subscription matrix according to "Rifah Connect Subscribers Plans.xlsx".
 * Single source of truth for subscription tiers, feature permissions, and quotas.
 */
export const SUBSCRIBER_TIER_CONFIG = {
  tier_1: {
    key: "tier_1",
    name: "Tier I (Free)",
    rank: 1,
    monthlyCost: 0,
    users: 1,
    chatbot_support: true,
    business_profile_listing: true,
    business_discovery: true,
    product_catalogue_browsing: true,
    service_browsing: true,
    general_feed_check: true,
    feed_posting: 0,
    chat: 0,
    networking_groups: 0,
    networking_groups_create: false,
    enquiry_posting: 2,
    lead_unlock: 1,
    quotation_chat: 0,
    meeting_request: 0,
    meeting_accept: true,
    product_listing: 1,
    service_listing: 1,
    business_verification: false,
    featured_business: false,
    featured_products: false,
    priority_visibility: false,
    analytics: "Basic",
    lms: false,
    team_members: 0,
    multiple_locations: 0,
    support: false,
    carry_forward: false,
    event_notifications: 0,
    event_announcements: 0,
    whatsapp_integration: false,
    thank_you_note: true,
    language_support: true,
  },
  tier_2: {
    key: "tier_2",
    name: "Tier II (Starter)",
    rank: 2,
    monthlyCost: 50,
    users: 1,
    chatbot_support: true,
    business_profile_listing: true,
    business_discovery: true,
    product_catalogue_browsing: true,
    service_browsing: true,
    general_feed_check: true,
    feed_posting: 5,
    chat: 5,
    networking_groups: 5, // Join up to 5
    networking_groups_create: false,
    enquiry_posting: 10,
    lead_unlock: 5,
    quotation_chat: 5,
    meeting_request: 5,
    meeting_accept: true,
    product_listing: 5,
    service_listing: 5,
    business_verification: false,
    featured_business: false,
    featured_products: false,
    priority_visibility: false,
    analytics: "Basic",
    lms: "Free content",
    team_members: 0,
    multiple_locations: 0,
    support: "Standard",
    carry_forward: false,
    event_notifications: 5,
    event_announcements: 5,
    whatsapp_integration: false,
    thank_you_note: true,
    language_support: true,
  },
  tier_3: {
    key: "tier_3",
    name: "Tier III (Growth)",
    rank: 3,
    monthlyCost: 100,
    users: 1,
    chatbot_support: true,
    business_profile_listing: true,
    business_discovery: true,
    product_catalogue_browsing: true,
    service_browsing: true,
    general_feed_check: true,
    feed_posting: 10,
    chat: 15,
    networking_groups: 5, // Join up to 5
    networking_groups_create: true, // + Create
    enquiry_posting: 30,
    lead_unlock: 15,
    quotation_chat: 20,
    meeting_request: 15,
    meeting_accept: true,
    product_listing: 10,
    service_listing: 10,
    business_verification: false,
    featured_business: true,
    featured_products: true,
    priority_visibility: true,
    analytics: "Advanced",
    lms: "Selected content",
    team_members: "Limited",
    multiple_locations: 3,
    support: "Priority",
    carry_forward: true,
    event_notifications: 10,
    event_announcements: 10,
    whatsapp_integration: true,
    thank_you_note: true,
    language_support: true,
  },
  tier_4: {
    key: "tier_4",
    name: "Tier IV (Enterprise)",
    rank: 4,
    monthlyCost: 200,
    users: 5,
    chatbot_support: true,
    business_profile_listing: true,
    business_discovery: true,
    product_catalogue_browsing: true,
    service_browsing: true,
    general_feed_check: true,
    feed_posting: 20,
    chat: Infinity,
    networking_groups: Infinity,
    networking_groups_create: true,
    enquiry_posting: Infinity,
    lead_unlock: Infinity,
    quotation_chat: Infinity,
    meeting_request: Infinity,
    meeting_accept: true,
    product_listing: Infinity,
    service_listing: Infinity,
    business_verification: false,
    featured_business: true,
    featured_products: true,
    priority_visibility: true,
    analytics: "Enterprise",
    lms: "Full access",
    team_members: "Full",
    multiple_locations: Infinity,
    support: "Priority",
    carry_forward: true,
    event_notifications: Infinity,
    event_announcements: Infinity,
    whatsapp_integration: true,
    thank_you_note: true,
    language_support: true,
  },
};

export const TIER_RANKS = {
  tier_1: 1,
  tier_2: 2,
  tier_3: 3,
  tier_4: 4,
};

export const FEATURE_LABELS = {
  feed_posting: "Feed Posting",
  chat: "Direct Chat",
  networking_groups: "Networking Groups",
  enquiry_posting: "Enquiry Posting",
  lead_unlock: "Accept & Unlock Lead",
  quotation_chat: "Quotation Posting + Chat",
  meeting_request: "One-to-One Meeting Request",
  meeting_accept: "One-to-One Meeting Accept",
  product_listing: "Catalogue Product Listing",
  service_listing: "Services Listing",
  featured_business: "Featured Business",
  featured_products: "Featured Products",
  priority_visibility: "Priority Visibility",
  analytics: "Analytics",
  lms: "LMS",
  team_members: "Team Members Listing",
  multiple_locations: "Multiple Locations Listing",
  support: "Support",
  whatsapp_integration: "WhatsApp Integration",
  event_notifications: "Event Notifications",
  event_announcements: "Event Announcement",
};

/**
 * Normalizes any plan name, chamber tier, or subscriber tier string to canonical tier key.
 */
export const normalizeTierKey = (val) => {
  if (!val) return "tier_1";
  const s = String(val).toLowerCase().trim();
  if (
    s.includes("tier iv") ||
    s.includes("tier 4") ||
    s.includes("tier_4") ||
    s.includes("enterprise") ||
    s.includes("diamond") ||
    s.includes("platinum")
  ) {
    return "tier_4";
  }
  if (
    s.includes("tier iii") ||
    s.includes("tier 3") ||
    s.includes("tier_3") ||
    s.includes("growth") ||
    s.includes("gold")
  ) {
    return "tier_3";
  }
  if (
    s.includes("tier ii") ||
    s.includes("tier 2") ||
    s.includes("tier_2") ||
    s.includes("starter") ||
    s.includes("silver")
  ) {
    return "tier_2";
  }
  return "tier_1";
};

export const isFreeTierPlanName = (planName) => {
  return normalizeTierKey(planName) === "tier_1";
};

/**
 * Resolves the member's authoritative subscription tier and status.
 * Evaluates all tier signals (business, user, membership) taking the maximum rank.
 *
 * @param {string|object} userOrId
 * @returns {Promise<{
 *   tierKey: string,
 *   tierName: string,
 *   rank: number,
 *   isFree: boolean,
 *   userId: string,
 *   businessId: string|null,
 *   membershipStatus: string|null,
 *   isMembershipValid: boolean,
 *   reason: string|null,
 *   features: object,
 *   planName: string,
 *   norm: string
 * }>}
 */
export const resolveMemberPlanContext = async (userOrId) => {
  let userId = "";
  if (userOrId) {
    if (typeof userOrId === "string") {
      userId = userOrId.trim();
    } else if (userOrId instanceof mongoose.Types.ObjectId) {
      userId = userOrId.toString();
    } else if (userOrId._id) {
      userId = String(userOrId._id);
    } else if (typeof userOrId.id === "string") {
      userId = userOrId.id;
    } else if (typeof userOrId.toString === "function") {
      userId = userOrId.toString();
    } else {
      userId = String(userOrId);
    }
  }

  const isValidObjectId = mongoose.Types.ObjectId.isValid(userId);
  const userDoc = isValidObjectId ? await User.findById(userId).select("membershipPlan subscriberTier membership role email") : null;
  const business = isValidObjectId ? await Business.findOne({ owner: userId }).select("_id membership subscriberTier") : null;

  let membership = null;
  if (business?._id) {
    membership = await Membership.findOne({ business: business._id }).select("status endDate planId planName subscriberTier");
  }

  // Collect candidate tier strings from all available sources
  const candidateStrings = [
    business?.subscriberTier,
    business?.membership,
    userDoc?.subscriberTier,
    userDoc?.membershipPlan,
    userDoc?.membership,
    membership?.subscriberTier,
    membership?.planId,
    membership?.planName,
  ].filter(Boolean);

  let highestTierKey = "tier_1";
  let highestRank = 1;

  for (const str of candidateStrings) {
    const key = normalizeTierKey(str);
    const rank = TIER_RANKS[key] || 1;
    if (rank > highestRank) {
      highestRank = rank;
      highestTierKey = key;
    }
  }

  const isFree = highestTierKey === "tier_1";
  const tierConfig = SUBSCRIBER_TIER_CONFIG[highestTierKey] || SUBSCRIBER_TIER_CONFIG.tier_1;
  const planName = tierConfig.name;
  const norm = highestTierKey;

  // Free tier has nothing to expire
  if (isFree || !business) {
    return {
      tierKey: highestTierKey,
      tierName: planName,
      rank: highestRank,
      isFree: true,
      userId,
      businessId: business?._id || null,
      membershipStatus: membership?.status || "Active",
      isMembershipValid: true,
      reason: null,
      features: tierConfig,
      planName,
      norm,
    };
  }

  // Check paid tier validity
  const now = new Date();
  const isExpiredByDate = membership?.endDate && new Date(membership.endDate) < now;
  const isValidStatus = !membership?.status || membership.status === "Active" || membership.status === "Grace Period";
  const isMembershipValid = Boolean(isValidStatus && !isExpiredByDate);

  const reason = isMembershipValid
    ? null
    : isExpiredByDate
    ? "subscription_expired"
    : "membership_inactive";

  // If subscription has expired, effective access drops to tier_1 while retaining the reason
  const effectiveTierKey = isMembershipValid ? highestTierKey : "tier_1";
  const effectiveTierConfig = SUBSCRIBER_TIER_CONFIG[effectiveTierKey];

  return {
    tierKey: effectiveTierKey,
    tierName: effectiveTierConfig.name,
    rawTierKey: highestTierKey,
    rank: effectiveTierConfig.rank,
    isFree: effectiveTierKey === "tier_1",
    userId,
    businessId: business._id,
    membershipStatus: membership?.status || null,
    isMembershipValid,
    reason,
    features: effectiveTierConfig,
    planName: effectiveTierConfig.name,
    norm: effectiveTierKey,
  };
};

/**
 * Asserts that the member's subscription is currently active.
 */
export const assertMembershipValid = (context, ForbiddenErrorClass) => {
  if (context.isFree || context.isMembershipValid) return;
  const message =
    context.reason === "subscription_expired"
      ? `Your ${context.tierName || context.planName} subscription has expired. Please renew your plan to continue using this feature.`
      : `Your membership is not currently active (${context.membershipStatus || "inactive"}). Please renew your subscription to access this feature.`;
  throw new ForbiddenErrorClass(message);
};

/**
 * Evaluates whether a user can perform an action based on their active subscription tier and live usage.
 *
 * @param {string|object} userOrContext
 * @param {string} featureKey
 * @param {number} requestedQuantity
 * @returns {Promise<{
 *   isAllowed: boolean,
 *   tierKey: string,
 *   tierName: string,
 *   limit: number|boolean|string,
 *   currentUsage: number,
 *   remaining: number,
 *   reason: string|null,
 *   message: string|null
 * }>}
 */
export const checkFeatureAccess = async (userOrContext, featureKey, requestedQuantity = 1) => {
  const context = (userOrContext && userOrContext.tierKey)
    ? userOrContext
    : await resolveMemberPlanContext(userOrContext);

  const featureLabel = FEATURE_LABELS[featureKey] || featureKey;
  const tierConfig = SUBSCRIBER_TIER_CONFIG[context.tierKey] || SUBSCRIBER_TIER_CONFIG.tier_1;
  const tierLimit = tierConfig[featureKey];

  if (!context.isMembershipValid && !context.isFree) {
    return {
      isAllowed: false,
      tierKey: context.tierKey,
      tierName: context.tierName,
      limit: 0,
      currentUsage: 0,
      remaining: 0,
      reason: context.reason || "subscription_expired",
      message: `Your ${context.tierName} subscription has expired. Please renew your plan to use ${featureLabel}.`,
    };
  }

  // Boolean features
  if (typeof tierLimit === "boolean") {
    if (!tierLimit) {
      const upgradeTier = (context.tierKey === "tier_1" || context.tierKey === "tier_2") ? "Tier III (Growth)" : "Tier IV (Enterprise)";
      return {
        isAllowed: false,
        tierKey: context.tierKey,
        tierName: context.tierName,
        limit: false,
        currentUsage: 0,
        remaining: 0,
        reason: "feature_unavailable",
        message: `${featureLabel} is not available on your current plan (${context.tierName}). Upgrade to ${upgradeTier} or above to access this feature.`,
      };
    }
    return {
      isAllowed: true,
      tierKey: context.tierKey,
      tierName: context.tierName,
      limit: true,
      currentUsage: 0,
      remaining: Infinity,
      reason: null,
      message: null,
    };
  }

  // String features (e.g. support="Standard", lms="Free content", analytics="Basic")
  if (typeof tierLimit === "string") {
    return {
      isAllowed: true,
      tierKey: context.tierKey,
      tierName: context.tierName,
      limit: tierLimit,
      currentUsage: 0,
      remaining: Infinity,
      reason: null,
      message: null,
    };
  }

  // Numerical quotas (0, 1, 5, 10, 15, 20, Infinity)
  if (tierLimit === 0 || tierLimit === false || tierLimit === undefined) {
    const nextTier = context.tierKey === "tier_1" ? "Tier II (Starter)" : "a higher tier";
    return {
      isAllowed: false,
      tierKey: context.tierKey,
      tierName: context.tierName,
      limit: 0,
      currentUsage: 0,
      remaining: 0,
      reason: "feature_unavailable",
      message: `${featureLabel} is not included in ${context.tierName}. Please upgrade your subscription plan to ${nextTier} to use this feature.`,
    };
  }

  if (tierLimit === Infinity) {
    return {
      isAllowed: true,
      tierKey: context.tierKey,
      tierName: context.tierName,
      limit: "Unlimited",
      currentUsage: 0,
      remaining: Infinity,
      reason: null,
      message: null,
    };
  }

  // Calculate live usage from the database
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  let currentUsage = 0;

  switch (featureKey) {
    case "product_listing":
      if (context.businessId) {
        currentUsage = await Catalogue.countDocuments({
          business: context.businessId,
          type: "Product",
        });
      }
      break;

    case "service_listing":
      if (context.businessId) {
        currentUsage = await Catalogue.countDocuments({
          business: context.businessId,
          type: "Service",
        });
      }
      break;

    case "feed_posting":
      if (context.userId) {
        currentUsage = await Post.countDocuments({
          author: context.userId,
          createdAt: { $gte: thirtyDaysAgo },
        });
      }
      break;

    case "chat":
      if (context.userId) {
        const convs = await Message.distinct("conversationId", {
          $or: [{ sender: context.userId }, { recipient: context.userId }],
        });
        currentUsage = convs.length;
      }
      break;

    case "enquiry_posting":
      if (context.userId) {
        currentUsage = await Enquiry.countDocuments({
          requester: context.userId,
          createdAt: { $gte: thirtyDaysAgo },
        });
      }
      break;

    case "lead_unlock":
      if (context.businessId) {
        currentUsage = await Lead.countDocuments({
          business: context.businessId,
          status: { $in: ["In Progress", "Accepted", "Contacted", "Responded", "Won", "Closed"] },
          createdAt: { $gte: thirtyDaysAgo },
        });
      }
      break;

    case "quotation_chat":
      if (context.businessId) {
        currentUsage = await Lead.countDocuments({
          business: context.businessId,
          "quotation.submittedAt": { $gte: thirtyDaysAgo },
        });
      }
      break;

    case "meeting_request":
      if (context.userId) {
        currentUsage = await OneToOne.countDocuments({
          initiatorUser: context.userId,
          createdAt: { $gte: thirtyDaysAgo },
        });
      }
      break;

    default:
      currentUsage = 0;
  }

  const remaining = Math.max(0, tierLimit - currentUsage);

  if (currentUsage + requestedQuantity > tierLimit) {
    const higherTierName =
      context.tierKey === "tier_1"
        ? "Tier II (Starter)"
        : context.tierKey === "tier_2"
        ? "Tier III (Growth)"
        : "Tier IV (Enterprise)";

    return {
      isAllowed: false,
      tierKey: context.tierKey,
      tierName: context.tierName,
      limit: tierLimit,
      currentUsage,
      remaining: 0,
      reason: "quota_exhausted",
      message: `${featureLabel} limit reached (${currentUsage}/${tierLimit} used on ${context.tierName}). Please upgrade to ${higherTierName} for higher capacity.`,
    };
  }

  return {
    isAllowed: true,
    tierKey: context.tierKey,
    tierName: context.tierName,
    limit: tierLimit,
    currentUsage,
    remaining,
    reason: null,
    message: null,
  };
};

/**
 * Asserts feature access or throws a ForbiddenError with an explanatory message.
 */
export const assertFeatureAccess = async (userOrContext, featureKey, requestedQuantity = 1, ForbiddenErrorClass) => {
  const result = await checkFeatureAccess(userOrContext, featureKey, requestedQuantity);
  if (!result.isAllowed) {
    throw new ForbiddenErrorClass(result.message);
  }
  return result;
};
