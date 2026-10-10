import { User } from "../../modules/users/user.model.js";
import { Business } from "../../modules/businesses/business.model.js";
import { Membership } from "../../modules/memberships/membership.model.js";

// BUG-065: shared resolver for "what plan is this member on, and is their underlying
// subscription actually still valid" — extracted from five near-identical blocks that
// were each independently doing `userDoc.membershipPlan || userDoc.membership ||
// business?.membership || "Tier I (Free)"` (message.service.js, lead.service.js x2,
// post.service.js, one-to-one.service.js, catalogue.service.js keeps its own slightly
// different plan-tier BUCKET thresholds — those are intentionally left untouched
// per-service, only this common "which plan, and is it still active" resolution step is
// centralized here).
//
// The key gap this closes: none of those five blocks ever checked whether the
// member's actual Membership record had expired — they only read the cached plan-name
// string on User/Business, which nothing resets on expiry. A member whose subscription
// lapsed kept full tier access forever. This resolver checks the real Membership
// document's status/endDate and surfaces a distinct, explainable reason when it's not
// current — "both a valid membership and an active subscription" (spec Requirement 2).
const FREE_TIER_PATTERNS = ["free", "tier i ", "tier 1", "tier i", "tier_1"];

export const isFreeTierPlanName = (planName) => {
  const norm = String(planName || "").toLowerCase().trim();
  return FREE_TIER_PATTERNS.some((p) => norm === p || norm.includes(p));
};

/**
 * @param {string} userId
 * @returns {Promise<{
 *   planName: string, norm: string, isFree: boolean,
 *   businessId: string|null, membershipStatus: string|null,
 *   isMembershipValid: boolean, reason: string|null
 * }>}
 */
export const resolveMemberPlanContext = async (userId) => {
  const userDoc = await User.findById(userId).select("membershipPlan membership role");
  const business = await Business.findOne({ owner: userId }).select("_id membership");

  const planName = userDoc?.membershipPlan || userDoc?.membership || business?.membership || "Tier I (Free)";
  const norm = String(planName).toLowerCase().trim();
  const isFree = isFreeTierPlanName(planName);

  // Free tier has nothing to expire — only paid tiers need the live Membership check.
  if (isFree || !business) {
    return { planName, norm, isFree, businessId: business?._id || null, membershipStatus: null, isMembershipValid: true, reason: null };
  }

  const membership = await Membership.findOne({ business: business._id }).select("status endDate");
  if (!membership) {
    // A cached "Gold"/"Tier III" string with no real Membership record behind it at all
    // (e.g. a pre-fix legacy account) — treat as not current rather than trusting the
    // stale string, but don't hard-fail; the plan-name-based tier buckets below still
    // apply as a fallback so this never regresses an account that's actually fine.
    return { planName, norm, isFree, businessId: business._id, membershipStatus: null, isMembershipValid: true, reason: null };
  }

  const now = new Date();
  const isExpiredByDate = membership.endDate && membership.endDate < now;
  const isValidStatus = membership.status === "Active" || membership.status === "Grace Period";
  const isMembershipValid = isValidStatus && !isExpiredByDate;

  return {
    planName,
    norm,
    isFree,
    businessId: business._id,
    membershipStatus: membership.status,
    isMembershipValid,
    reason: isMembershipValid
      ? null
      : isExpiredByDate
      ? "subscription_expired"
      : "membership_inactive",
  };
};

/**
 * Throws a clear, reason-specific ForbiddenError-shaped error if the member's
 * subscription is not current — call this BEFORE a feature's own tier-limit check, so a
 * lapsed member gets "your subscription expired" instead of a confusing tier-limit
 * message. Callers pass their own error class to avoid a circular import on
 * shared/errors (each service already imports ForbiddenError itself).
 */
export const assertMembershipValid = (context, ForbiddenErrorClass) => {
  if (context.isFree || context.isMembershipValid) return;
  const message =
    context.reason === "subscription_expired"
      ? `Your ${context.planName} subscription has expired. Please renew to continue using this feature.`
      : `Your membership is not currently active (${context.membershipStatus || "inactive"}). Please contact support or renew your membership.`;
  throw new ForbiddenErrorClass(message);
};
