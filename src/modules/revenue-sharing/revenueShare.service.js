import { RevenueShareRule } from "./revenueShareRule.model.js";
import { RevenueLedgerEntry } from "./revenueLedgerEntry.model.js";
import { RevenueAdjustment } from "./revenueAdjustment.model.js";
import { Business } from "../businesses/business.model.js";
import { Chapter } from "../chapters/chapter.model.js";
import { Event } from "../events/event.model.js";
import { resolveChapterIdByName } from "../../shared/utils/chapter-scope.js";
import { BadRequestError } from "../../shared/errors/errors.js";
import { logger } from "../../infrastructure/logger/logger.js";

export const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

const toAccountingPeriod = (date) => {
  const d = date instanceof Date ? date : new Date(date);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${yyyy}-${mm}`;
};

/**
 * Picks the rule version active at a given instant for a revenue type. Rule changes
 * apply only to payments from their effectiveFrom date onward — a payment made before a
 * new rule version took effect keeps using whichever version WAS active then, even if
 * queried long after a newer version exists. This is what makes historical allocations
 * immune to later rule edits.
 */
export const getActiveRule = async (revenueType, asOfDate = new Date()) => {
  const rule = await RevenueShareRule.findOne({
    revenueType,
    isActive: true,
    effectiveFrom: { $lte: asOfDate },
    $or: [{ effectiveTo: null }, { effectiveTo: { $gt: asOfDate } }],
  }).sort({ effectiveFrom: -1, version: -1 });

  if (!rule) {
    throw new BadRequestError(
      `No active revenue-share rule configured for "${revenueType}" as of ${asOfDate.toISOString()}`
    );
  }
  return rule;
};

/**
 * Splits eligibleBase across a rule's allocations, rounded to 2dp, with the LAST
 * allocation absorbing the rounding remainder so the sum always reconciles exactly to
 * eligibleBase (never a paisa over or under because three independently-rounded
 * percentages happened to round up/down inconsistently).
 */
export const computeAllocations = (eligibleBase, rule) => {
  const base = round2(eligibleBase);
  const allocations = rule.allocations;
  const results = [];
  let allocatedSoFar = 0;

  allocations.forEach((alloc, idx) => {
    const isLast = idx === allocations.length - 1;
    let amount;
    if (isLast) {
      amount = round2(base - allocatedSoFar);
    } else {
      amount = round2((base * alloc.percentage) / 100);
    }
    allocatedSoFar = round2(allocatedSoFar + amount);
    results.push({
      beneficiaryLevel: alloc.beneficiaryLevel,
      percentage: alloc.percentage,
      amount,
    });
  });

  return results;
};

/**
 * Resolves the chapter/state a membership payment's chapter-level and state-level
 * allocations belong to, snapshotting the association at allocation time (not a live
 * reference — later chapter/state re-assignment never silently rewrites history).
 */
const resolveMembershipOrg = async (payment) => {
  let chapterId = null;
  let chapterName = "";
  let state = "";

  if (payment.business) {
    const business = await Business.findById(payment.business).select("chapterId chapter state").lean();
    if (business) {
      chapterId = business.chapterId || null;
      chapterName = business.chapter || "";
      state = business.state || "";
    }
  }

  // Fall back to the snapshot strings already stored on the Payment itself (set at
  // payment-creation time) if the business lookup didn't resolve one.
  if (!chapterName && payment.chapter) chapterName = payment.chapter;
  if (!state && payment.state) state = payment.state;

  if (!chapterId && chapterName) {
    chapterId = await resolveChapterIdByName(chapterName);
  }
  if (!state && chapterId) {
    const chapter = await Chapter.findById(chapterId).select("state").lean();
    if (chapter?.state) state = chapter.state;
  }

  return { chapterId, chapterName, state };
};

/**
 * Resolves the organizing chapter/state for an event, from the exact RBAC fields
 * event.service.js already stamps at event-creation time (visibilityScope +
 * creatorChapter/creatorState) — see event.model.js. No new field added to Event.
 */
const resolveEventOrg = async (event) => {
  if (!event) return { organizerLevel: null, chapterId: null, chapterName: "", state: "" };

  if (event.visibilityScope === "chapter") {
    const chapterName = event.creatorChapter || event.chapter || "";
    const chapterId = chapterName ? await resolveChapterIdByName(chapterName) : null;
    let state = "";
    if (chapterId) {
      const chapter = await Chapter.findById(chapterId).select("state").lean();
      state = chapter?.state || "";
    }
    return { organizerLevel: "chapter", chapterId, chapterName, state };
  }

  if (event.visibilityScope === "state") {
    return { organizerLevel: "state", chapterId: null, chapterName: "", state: event.creatorState || "" };
  }

  // "global" — Central-organized. No chapter/state beneficiary (see plan doc assumption).
  return { organizerLevel: "global", chapterId: null, chapterName: "", state: "" };
};

/**
 * Creates the revenue-sharing ledger entries for a newly-confirmed-Paid Payment.
 * Idempotent: RevenueLedgerEntry has a unique {sourcePaymentId, beneficiaryLevel} index,
 * so calling this twice for the same payment (duplicate webhook/retry/double-click) is
 * safe — the duplicate insert attempt is caught and treated as a no-op.
 *
 * Only two revenue types are in scope, matching the spec exactly:
 *   - itemType === "Membership"   -> membership rule (chapter 50 / state 25 / central 25)
 *   - payment.eventId is set      -> event rule (100% to organizer level)
 * Everything else (Course, Custom Invoice with no event, etc.) is out of scope and gets
 * no ledger entries.
 *
 * @param {import("../payments/payment.model.js").Payment} payment - a Mongoose Payment doc, status "Paid"
 * @param {{event?: object, session?: import("mongoose").ClientSession, actor?: object}} [opts]
 * @returns {Promise<Array>} the created ledger entries (empty array if out of scope or already created)
 */
export const createLedgerEntriesForPayment = async (payment, opts = {}) => {
  if (!payment || payment.status !== "Paid") return [];

  const isMembership = (payment.itemType || "").toLowerCase() === "membership" && !payment.eventId;
  const isEvent = Boolean(payment.eventId);

  if (!isMembership && !isEvent) return [];

  const revenueType = isMembership ? "membership" : "event";
  // payment.subtotal is only actually populated by payment.service.js's creation paths
  // when a GST/duration/event condition fires during that payment's creation (confirmed
  // by reading verifyRazorpayPayment/createPayment directly) — in the common
  // no-special-case path it's left at its schema default of 0 while payment.amount
  // already correctly holds the pre-GST base. Fall back to amount so eligibleBase is
  // never wrongly zero for a real paid payment.
  const eligibleBase = round2(Number(payment.subtotal) || Number(payment.amount) || 0);
  if (eligibleBase <= 0) return [];

  const transactionDate = payment.paidAt || payment.createdAt || new Date();
  const rule = await getActiveRule(revenueType, transactionDate);
  const rawAllocations = computeAllocations(eligibleBase, rule);

  let org;
  let eventOrganizerLevel = null;
  let sourceReference = { type: revenueType, refId: null };

  if (isMembership) {
    org = await resolveMembershipOrg(payment);
    sourceReference.refId = payment.business || null;
  } else {
    const event = opts.event || (await Event.findById(payment.eventId).lean());
    const resolved = await resolveEventOrg(event);
    eventOrganizerLevel = resolved.organizerLevel;
    org = resolved;
    sourceReference.refId = payment.eventId || null;

    // "organizer" in the rule resolves to whichever level actually organized this event.
    // A global (Central-organized) event has no chapter/state organizer to pay out to —
    // no ledger rows are created for it at all (Central already has the money, matching
    // the spec's two explicit rules which only cover chapter- and state-organized events).
    if (eventOrganizerLevel === "global" || !eventOrganizerLevel) {
      return [];
    }
  }

  const docs = rawAllocations.map((alloc) => {
    // Event rule allocations use the literal level "organizer" — map it to whichever
    // level actually organized this event for storage/querying purposes.
    const beneficiaryLevel =
      alloc.beneficiaryLevel === "organizer" ? eventOrganizerLevel : alloc.beneficiaryLevel;

    return {
      sourcePaymentId: payment._id,
      sourceReference,
      revenueType,
      payerUserId: payment.payer || null,
      businessId: payment.business || null,
      eventId: payment.eventId || null,
      eventOrganizerLevel,
      chapterId: org.chapterId,
      chapter: org.chapterName || "",
      state: org.state || "",
      grossAmount: round2(Number(payment.amount) || 0),
      discount: 0,
      gstAmount: round2(Number(payment.gstAmount) || 0) + round2(Number(payment.tcsAmount) || 0),
      refundAmount: 0,
      eligibleBase,
      ruleId: rule._id,
      ruleVersion: rule.version,
      beneficiaryLevel,
      percentage: alloc.percentage,
      calculationBasis: "subtotal",
      allocatedAmount: alloc.amount,
      payingOrgLevel: "central",
      currency: payment.currency || "INR",
      accountingPeriod: toAccountingPeriod(transactionDate),
      transactionDate,
      // Central's own share of its own collection is not a payable liability — settle
      // it immediately on creation rather than inventing a special-case status.
      status: beneficiaryLevel === "central" ? "paid" : "payable",
      createdBy: opts.actor?.id || opts.actor?._id || null,
    };
  });

  try {
    const created = await RevenueLedgerEntry.insertMany(docs, {
      session: opts.session,
      ordered: true,
    });
    return created;
  } catch (err) {
    // Duplicate key on the {sourcePaymentId, beneficiaryLevel} unique index = this
    // payment's ledger entries were already created by an earlier call (retry/duplicate
    // webhook-equivalent). Safe, expected no-op.
    if (err?.code === 11000) {
      logger.info(`[REVENUE SHARE] Ledger entries for payment ${payment._id} already exist, skipping.`);
      return [];
    }
    throw err;
  }
};

/**
 * Reverses the ledger entries for a payment that has been refunded/revoked. Never
 * mutates the original RevenueLedgerEntry rows — creates RevenueAdjustment rows instead,
 * and flips entry status to "reversed" only if it hadn't already been paid out. An
 * already-PAID entry being refunded is flagged (requiresReview) rather than silently
 * deducted from something unrelated.
 */
export const reverseLedgerEntriesForPayment = async (payment, reason, actor, opts = {}) => {
  if (!payment) return [];
  const entries = await RevenueLedgerEntry.find({ sourcePaymentId: payment._id }).session(opts.session || null);
  if (entries.length === 0) return [];

  const adjustments = [];
  for (const entry of entries) {
    const alreadyPaid = entry.status === "paid";
    const adjustment = await RevenueAdjustment.create(
      [
        {
          ledgerEntryId: entry._id,
          type: "refund",
          amount: -Math.abs(entry.allocatedAmount),
          reason: reason || "Payment refunded/revoked",
          requiresReview: alreadyPaid,
          status: alreadyPaid ? "pending" : "applied",
          createdBy: actor?.id || actor?._id || null,
        },
      ],
      { session: opts.session }
    );
    adjustments.push(adjustment[0]);

    if (!alreadyPaid) {
      entry.status = "reversed";
      entry.refundAmount = round2(Math.abs(entry.allocatedAmount));
      await entry.save({ session: opts.session });
    }
  }

  return adjustments;
};

export const revenueShareService = {
  getActiveRule,
  computeAllocations,
  createLedgerEntriesForPayment,
  reverseLedgerEntriesForPayment,
  round2,
  toAccountingPeriod,
};

export default revenueShareService;
