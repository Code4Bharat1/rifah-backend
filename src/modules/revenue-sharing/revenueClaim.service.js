import mongoose from "mongoose";
import { RevenueLedgerEntry } from "./revenueLedgerEntry.model.js";
import { RevenueAdjustment } from "./revenueAdjustment.model.js";
import { RevenueClaim } from "./revenueClaim.model.js";
import { RevenueSettlement } from "./revenueSettlement.model.js";
import { resolveChapterIdByName } from "../../shared/utils/chapter-scope.js";
import { Chapter } from "../chapters/chapter.model.js";
import { ROLES } from "../../shared/constants/roles.js";
import {
  BadRequestError,
  ForbiddenError,
  NotFoundError,
  ConflictError,
} from "../../shared/errors/errors.js";
import { generateReferenceId } from "../../shared/utils/generate-id.js";
import { round2 } from "./revenueShare.service.js";

const OPEN_LEDGER_STATUSES = ["payable", "partially_paid"];

/**
 * Computes a beneficiary organization's outstanding balance purely by summing ledger
 * entries + adjustments + settlements — never from a stored, hand-editable total. This
 * is also what "opening/new earnings/payments/closing" period reporting (spec §5) is
 * built from; see getOrgPeriodSummary below.
 */
const buildBeneficiaryMatch = (level, id) => {
  if (level === "chapter")
    return { beneficiaryLevel: "chapter", chapterId: id };
  if (level === "state")
    return {
      beneficiaryLevel: "state",
      state: new RegExp(`^${String(id).trim()}$`, "i"),
    };
  throw new BadRequestError('level must be "chapter" or "state"');
};

export const getOrgBalance = async (level, id, { upToPeriod } = {}) => {
  const match = buildBeneficiaryMatch(level, id);
  if (upToPeriod) match.accountingPeriod = { $lte: upToPeriod };

  const entries = await RevenueLedgerEntry.find({
    ...match,
    status: { $in: [...OPEN_LEDGER_STATUSES, "paid", "reversed", "disputed"] },
  }).select("_id allocatedAmount status");

  const entryIds = entries.map((e) => e._id);
  const totalEarned = entries
    .filter((e) => e.status !== "reversed")
    .reduce((sum, e) => sum + e.allocatedAmount, 0);

  const [adjustments, settlements] = await Promise.all([
    RevenueAdjustment.find({
      ledgerEntryId: { $in: entryIds },
      status: "applied",
    }).select("amount"),
    RevenueSettlement.aggregate([
      {
        $lookup: {
          from: "revenueclaims",
          localField: "claimId",
          foreignField: "_id",
          as: "claim",
        },
      },
      { $unwind: "$claim" },
      {
        $match: {
          "claim.beneficiaryLevel": level,
          ...(level === "chapter"
            ? { "claim.chapterId": id }
            : { "claim.state": match.state }),
        },
      },
      { $group: { _id: null, total: { $sum: "$amount" } } },
    ]),
  ]);

  const totalAdjustments = adjustments.reduce((sum, a) => sum + a.amount, 0);
  const totalSettled = settlements[0]?.total || 0;

  const outstanding = round2(totalEarned + totalAdjustments - totalSettled);

  return {
    level,
    id,
    totalEarned: round2(totalEarned),
    totalAdjustments: round2(totalAdjustments),
    totalSettled: round2(totalSettled),
    outstanding,
  };
};

/**
 * Per-period summary for an organization: opening (everything before this period),
 * earnings/adjustments/settlements that happened IN this period, and the resulting
 * closing balance. New earnings always ADD to the prior unpaid balance — there is no
 * code path here that resets or zeroes a balance at period boundaries.
 */
export const getOrgPeriodSummary = async (level, id, period) => {
  const match = buildBeneficiaryMatch(level, id);
  const before = await getOrgBalance(level, id, {
    upToPeriod: periodBefore(period),
  });

  const [entriesThisPeriod, adjustmentsThisPeriod, settlementsThisPeriod] =
    await Promise.all([
      RevenueLedgerEntry.find({
        ...match,
        accountingPeriod: period,
        status: { $ne: "reversed" },
      }).select("allocatedAmount"),
      RevenueAdjustment.aggregate([
        {
          $lookup: {
            from: "revenueledgerentries",
            localField: "ledgerEntryId",
            foreignField: "_id",
            as: "entry",
          },
        },
        { $unwind: "$entry" },
        {
          $match: {
            status: "applied",
            "entry.accountingPeriod": period,
            ...(level === "chapter"
              ? { "entry.chapterId": id }
              : { "entry.state": match.state }),
          },
        },
        { $group: { _id: null, total: { $sum: "$amount" } } },
      ]),
      RevenueSettlement.aggregate([
        {
          $lookup: {
            from: "revenueclaims",
            localField: "claimId",
            foreignField: "_id",
            as: "claim",
          },
        },
        { $unwind: "$claim" },
        {
          $match: {
            "claim.beneficiaryLevel": level,
            ...(level === "chapter"
              ? { "claim.chapterId": id }
              : { "claim.state": match.state }),
          },
        },
        {
          $addFields: {
            settledPeriod: {
              $dateToString: { format: "%Y-%m", date: "$paidAt" },
            },
          },
        },
        { $match: { settledPeriod: period } },
        { $group: { _id: null, total: { $sum: "$amount" } } },
      ]),
    ]);

  const newEarnings = round2(
    entriesThisPeriod.reduce((s, e) => s + e.allocatedAmount, 0),
  );
  const adjustments = round2(adjustmentsThisPeriod[0]?.total || 0);
  const payments = round2(settlementsThisPeriod[0]?.total || 0);
  const closing = round2(
    before.outstanding + newEarnings + adjustments - payments,
  );

  return {
    level,
    id,
    period,
    openingBalance: before.outstanding,
    newEarnings,
    adjustments,
    payments,
    closingBalance: closing,
  };
};

const periodBefore = (period) => {
  const [y, m] = period.split("-").map(Number);
  const d = new Date(y, m - 2, 1); // first of the month before `period`
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${yyyy}-${mm}`;
};

/**
 * Resolves the beneficiary {level, id} a given user is allowed to submit claims for —
 * chapter admins for their own chapter, state admins for their own state. Central Admin
 * is never a claimant (Center is always the payer, never owed by itself).
 */
const resolveOwnBeneficiary = async (user) => {
  if (user.role === ROLES.CHAPTER_ADMIN) {
    const chapterId =
      user.chapterId ||
      (user.chapter ? await resolveChapterIdByName(user.chapter) : null);
    if (!chapterId)
      throw new ForbiddenError("Your account is not linked to a chapter");
    return { level: "chapter", id: chapterId };
  }
  if (user.role === ROLES.STATE_ADMIN) {
    if (!user.state)
      throw new ForbiddenError("Your account is not linked to a state");
    return { level: "state", id: user.state };
  }
  throw new ForbiddenError(
    "Only Chapter or State Admins can submit revenue-sharing claims",
  );
};

const resolveClaimPayer = (beneficiaryLevel, revenueType = "membership") => {
  if (beneficiaryLevel === "state") return "central";
  if (beneficiaryLevel === "chapter")
    return revenueType === "event" ? "central" : "state";
  return "central";
};

export const createClaim = async (user, payload) => {
  const { level, id } = await resolveOwnBeneficiary(user);
  const revenueType = payload.revenueType === "event" ? "event" : "membership";
  const claimedAmount = round2(Number(payload.claimedAmount));
  if (!(claimedAmount > 0))
    throw new BadRequestError("Claimed amount must be greater than 0");

  const hasPeriodRange = payload.periodFrom && payload.periodTo;
  const hasEntryIds =
    Array.isArray(payload.ledgerEntryIds) && payload.ledgerEntryIds.length > 0;
  if (!hasPeriodRange && !hasEntryIds) {
    throw new BadRequestError(
      "A claim must reference either a period range or specific ledger entries",
    );
  }

  const balance = await getOrgBalance(level, id);
  if (claimedAmount > balance.outstanding && !payload.overrideApproved) {
    throw new BadRequestError(
      `Claimed amount (₹${claimedAmount}) exceeds the eligible outstanding balance (₹${balance.outstanding}). ` +
        `Use the adjustment-approved override to exceed this, with a reason.`,
    );
  }
  if (
    claimedAmount > balance.outstanding &&
    payload.overrideApproved &&
    user.role !== ROLES.CENTRAL_ADMIN
  ) {
    throw new ForbiddenError(
      "Only Central Admin can approve an over-balance claim override",
    );
  }

  let claimNumber = generateReferenceId("CLM", 5);
  for (let i = 0; i < 5 && (await RevenueClaim.exists({ claimNumber })); i++) {
    claimNumber = generateReferenceId("CLM", 5);
  }

  const claim = await RevenueClaim.create({
    claimNumber,
    beneficiaryLevel: level,
    chapterId: level === "chapter" ? id : null,
    state: level === "state" ? id : "",
    revenueType,
    payingOrgLevel: resolveClaimPayer(level, revenueType),
    claimedAmount,
    periodFrom: payload.periodFrom || "",
    periodTo: payload.periodTo || "",
    ledgerEntryIds: hasEntryIds ? payload.ledgerEntryIds : [],
    notes: payload.notes || "",
    attachments: payload.attachments || [],
    overrideApproved: Boolean(payload.overrideApproved),
    overrideReason: payload.overrideReason || "",
    overrideBy: payload.overrideApproved ? user.id || user._id : null,
    status: "draft",
    createdBy: user.id || user._id,
  });

  return claim;
};

const assertClaimVisible = (user, claim) => {
  if ([ROLES.CENTRAL_ADMIN, ROLES.SECRETARIAT].includes(user.role)) return;
  if (user.role === ROLES.CHAPTER_ADMIN) {
    if (
      claim.beneficiaryLevel === "chapter" &&
      String(claim.chapterId) === String(user.chapterId)
    )
      return;
    throw new ForbiddenError("You can only view claims for your own chapter");
  }
  if (user.role === ROLES.STATE_ADMIN) {
    if (
      (claim.beneficiaryLevel === "state" &&
        claim.state?.toLowerCase() === (user.state || "").toLowerCase()) ||
      claim.beneficiaryLevel === "chapter" // state admin can view its chapters' claims (read-only, §2)
    ) {
      return;
    }
    throw new ForbiddenError("You can only view claims within your own state");
  }
  throw new ForbiddenError(
    "You are not authorized to view revenue-sharing claims",
  );
};

export const getClaimById = async (user, claimId) => {
  const claim = await RevenueClaim.findById(claimId);
  if (!claim) throw new NotFoundError("Claim not found");
  assertClaimVisible(user, claim);
  return claim;
};

/**
 * Lists claims scoped to the requester: Central sees all, State sees its own state's
 * claims plus its chapters' (read-only visibility per spec §2), Chapter sees only its own.
 */
export const listClaims = async (user, query = {}) => {
  const filter = {};
  if (query.status && query.status !== "all") filter.status = query.status;
  if (query.beneficiaryLevel && query.beneficiaryLevel !== "all")
    filter.beneficiaryLevel = query.beneficiaryLevel;

  if ([ROLES.CENTRAL_ADMIN, ROLES.SECRETARIAT].includes(user.role)) {
    // unrestricted
  } else if (user.role === ROLES.CHAPTER_ADMIN) {
    const chapterId =
      user.chapterId ||
      (user.chapter ? await resolveChapterIdByName(user.chapter) : null);
    if (!chapterId) return [];
    filter.beneficiaryLevel = "chapter";
    filter.chapterId = chapterId;
  } else if (user.role === ROLES.STATE_ADMIN) {
    if (!user.state) return [];
    const stateRegex = new RegExp(`^${user.state.trim()}$`, "i");
    const stateChapters = await Chapter.find({ state: stateRegex }).select(
      "_id",
    );
    filter.$or = [
      { beneficiaryLevel: "state", state: stateRegex },
      // read-only visibility into its own chapters' claims (spec §2)
      {
        beneficiaryLevel: "chapter",
        chapterId: { $in: stateChapters.map((c) => c._id) },
      },
    ];
  } else {
    throw new ForbiddenError(
      "You are not authorized to view revenue-sharing claims",
    );
  }

  return RevenueClaim.find(filter)
    .sort({ createdAt: -1 })
    .populate("chapterId", "name state");
};

export const submitClaim = async (user, claimId) => {
  const claim = await RevenueClaim.findById(claimId);
  if (!claim) throw new NotFoundError("Claim not found");
  if (
    String(claim.createdBy) !== String(user.id || user._id) &&
    user.role !== ROLES.CENTRAL_ADMIN
  ) {
    throw new ForbiddenError("Only the claim's submitter can submit it");
  }
  if (claim.status !== "draft")
    throw new ConflictError(
      `Cannot submit a claim in "${claim.status}" status`,
    );
  claim.status = "submitted";
  claim.submittedBy = user.id || user._id;
  claim.submittedAt = new Date();
  await claim.save();
  return claim;
};

const requireCentralAdmin = (user) => {
  if (![ROLES.CENTRAL_ADMIN, ROLES.SECRETARIAT].includes(user.role)) {
    throw new ForbiddenError(
      "Only Central Admin can review, approve, reject or settle claims",
    );
  }
};

const assertSettlementPermission = (user, claim) => {
  if ([ROLES.CENTRAL_ADMIN, ROLES.SECRETARIAT].includes(user.role)) return;
  if (user.role === ROLES.STATE_ADMIN) {
    if (
      claim.beneficiaryLevel === "state" &&
      claim.state?.toLowerCase() === (user.state || "").toLowerCase()
    )
      return;
  }
  throw new ForbiddenError("You are not allowed to settle this claim");
};

export const reviewClaim = async (user, claimId) => {
  requireCentralAdmin(user);
  const claim = await RevenueClaim.findById(claimId);
  if (!claim) throw new NotFoundError("Claim not found");
  if (claim.status !== "submitted")
    throw new ConflictError(
      `Cannot review a claim in "${claim.status}" status`,
    );
  claim.status = "under_review";
  claim.reviewedBy = user.id || user._id;
  claim.reviewedAt = new Date();
  await claim.save();
  return claim;
};

export const approveClaim = async (user, claimId) => {
  requireCentralAdmin(user);
  const claim = await RevenueClaim.findById(claimId);
  if (!claim) throw new NotFoundError("Claim not found");
  if (!["submitted", "under_review"].includes(claim.status)) {
    throw new ConflictError(
      `Cannot approve a claim in "${claim.status}" status`,
    );
  }
  // Approving never touches outstanding balance — only recordSettlement does.
  claim.status = "approved";
  claim.approvedBy = user.id || user._id;
  claim.approvedAt = new Date();
  await claim.save();
  return claim;
};

export const rejectClaim = async (user, claimId, reason) => {
  requireCentralAdmin(user);
  if (!reason || !String(reason).trim())
    throw new BadRequestError("A rejection reason is required");
  const claim = await RevenueClaim.findById(claimId);
  if (!claim) throw new NotFoundError("Claim not found");
  if (!["submitted", "under_review"].includes(claim.status)) {
    throw new ConflictError(
      `Cannot reject a claim in "${claim.status}" status`,
    );
  }
  claim.status = "rejected";
  claim.rejectedBy = user.id || user._id;
  claim.rejectedAt = new Date();
  claim.rejectionReason = String(reason).trim();
  await claim.save();
  return claim;
};

export const cancelClaim = async (user, claimId) => {
  const claim = await RevenueClaim.findById(claimId);
  if (!claim) throw new NotFoundError("Claim not found");
  const isOwner = String(claim.createdBy) === String(user.id || user._id);
  if (
    !isOwner &&
    ![ROLES.CENTRAL_ADMIN, ROLES.SECRETARIAT].includes(user.role)
  ) {
    throw new ForbiddenError(
      "Only the submitter or Central Admin can cancel a claim",
    );
  }
  if (["paid", "cancelled"].includes(claim.status)) {
    throw new ConflictError(
      `Cannot cancel a claim in "${claim.status}" status`,
    );
  }
  claim.status = "cancelled";
  claim.cancelledBy = user.id || user._id;
  claim.cancelledAt = new Date();
  await claim.save();
  return claim;
};

/**
 * The only operation that actually reduces outstanding balance. Idempotent via the
 * required unique idempotencyKey: a retried call with the same key returns the original
 * settlement rather than creating a duplicate. Marks the claim's underlying ledger
 * entries paid/partially_paid (oldest transactionDate first) up to the settled amount,
 * inside a transaction so the claim/entry/settlement writes are all-or-nothing.
 */
export const recordSettlement = async (user, claimId, payload) => {
  const claim = await RevenueClaim.findById(claimId);
  if (!claim) throw new NotFoundError("Claim not found");
  assertSettlementPermission(user, claim);

  const amount = round2(Number(payload.amount));
  if (!(amount > 0))
    throw new BadRequestError("Settlement amount must be greater than 0");
  if (!payload.idempotencyKey)
    throw new BadRequestError("idempotencyKey is required");

  const existing = await RevenueSettlement.findOne({
    idempotencyKey: payload.idempotencyKey,
  });
  if (existing) return existing; // duplicate-safe no-op

  if (!["approved", "partially_paid"].includes(claim.status)) {
    throw new ConflictError(
      `Cannot settle a claim in "${claim.status}" status`,
    );
  }

  const session = await mongoose.startSession();
  try {
    let settlementDoc;
    await session.withTransaction(async () => {
      const [created] = await RevenueSettlement.create(
        [
          {
            claimId: claim._id,
            amount,
            method: payload.method || "Bank Transfer",
            referenceNumber: payload.referenceNumber || "",
            idempotencyKey: payload.idempotencyKey,
            notes: payload.notes || "",
            paidBy: user.id || user._id,
            paidAt: payload.paidAt ? new Date(payload.paidAt) : new Date(),
          },
        ],
        { session },
      );
      settlementDoc = created;

      // Apply the settled amount across this claim's open ledger entries, oldest first.
      const match =
        claim.ledgerEntryIds?.length > 0
          ? { _id: { $in: claim.ledgerEntryIds } }
          : buildBeneficiaryMatch(
              claim.beneficiaryLevel,
              claim.beneficiaryLevel === "chapter"
                ? claim.chapterId
                : claim.state,
            );

      const entries = await RevenueLedgerEntry.find({
        ...match,
        status: { $in: OPEN_LEDGER_STATUSES },
        ...(claim.periodFrom && claim.periodTo
          ? {
              accountingPeriod: {
                $gte: claim.periodFrom,
                $lte: claim.periodTo,
              },
            }
          : {}),
      })
        .sort({ transactionDate: 1 })
        .session(session);

      let remaining = amount;
      for (const entry of entries) {
        if (remaining <= 0) break;
        const openAmount = round2(
          entry.allocatedAmount - (entry.paidAmount || 0),
        );
        if (openAmount <= 0) continue;

        const applied = Math.min(remaining, openAmount);
        entry.paidAmount = round2((entry.paidAmount || 0) + applied);
        entry.status =
          entry.paidAmount >= entry.allocatedAmount ? "paid" : "partially_paid";
        entry.claimId = claim._id;
        entry.settlementIds = [
          ...(entry.settlementIds || []),
          settlementDoc._id,
        ];
        remaining = round2(remaining - applied);
        await entry.save({ session });
      }

      const balanceAfter = await getOrgBalance(
        claim.beneficiaryLevel,
        claim.beneficiaryLevel === "chapter" ? claim.chapterId : claim.state,
      );
      const totalSettledOnClaim = await RevenueSettlement.aggregate([
        { $match: { claimId: claim._id } },
        { $group: { _id: null, total: { $sum: "$amount" } } },
      ]);
      const settledTotal = round2(totalSettledOnClaim[0]?.total || 0);
      claim.status =
        settledTotal >= claim.claimedAmount ? "paid" : "partially_paid";
      void balanceAfter; // computed for potential response enrichment by the controller
      await claim.save({ session });
    });

    return settlementDoc;
  } finally {
    await session.endSession();
  }
};

export const revenueClaimService = {
  getOrgBalance,
  getOrgPeriodSummary,
  createClaim,
  getClaimById,
  listClaims,
  submitClaim,
  reviewClaim,
  approveClaim,
  rejectClaim,
  cancelClaim,
  recordSettlement,
};

export default revenueClaimService;
