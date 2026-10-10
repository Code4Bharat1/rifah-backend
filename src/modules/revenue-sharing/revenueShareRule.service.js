import { RevenueShareRule } from "./revenueShareRule.model.js";
import { BadRequestError } from "../../shared/errors/errors.js";

export const listRules = async (revenueType) => {
  const filter = revenueType && revenueType !== "all" ? { revenueType } : {};
  return RevenueShareRule.find(filter).sort({ revenueType: 1, version: -1 }).populate("createdBy", "name email");
};

/**
 * Publishes a new rule version, effective from a given date onward. Never edits an
 * existing version in place — rule changes apply only to payments from their
 * effectiveFrom date forward, so past allocations stay exactly as they were calculated.
 * Automatically closes out the previously-open-ended version of the same revenueType by
 * setting its effectiveTo to this new version's effectiveFrom.
 */
export const createRuleVersion = async (user, payload) => {
  const { revenueType, allocations, effectiveFrom, notes } = payload;
  if (!["membership", "event"].includes(revenueType)) {
    throw new BadRequestError('revenueType must be "membership" or "event"');
  }
  if (!Array.isArray(allocations) || allocations.length === 0) {
    throw new BadRequestError("At least one allocation is required");
  }
  const total = allocations.reduce((sum, a) => sum + Number(a.percentage || 0), 0);
  if (Math.abs(total - 100) > 0.01) {
    throw new BadRequestError(`Allocation percentages must sum to 100 (got ${total})`);
  }

  const effectiveFromDate = effectiveFrom ? new Date(effectiveFrom) : new Date();
  if (isNaN(effectiveFromDate.getTime())) throw new BadRequestError("Invalid effectiveFrom date");

  const latest = await RevenueShareRule.findOne({ revenueType }).sort({ version: -1 });
  const nextVersion = (latest?.version || 0) + 1;

  if (latest && (latest.effectiveTo === null || latest.effectiveTo > effectiveFromDate)) {
    latest.effectiveTo = effectiveFromDate;
    await latest.save();
  }

  return RevenueShareRule.create({
    revenueType,
    allocations,
    version: nextVersion,
    effectiveFrom: effectiveFromDate,
    effectiveTo: null,
    isActive: true,
    notes: notes || "",
    createdBy: user.id || user._id,
  });
};

export const revenueShareRuleService = { listRules, createRuleVersion };
export default revenueShareRuleService;
