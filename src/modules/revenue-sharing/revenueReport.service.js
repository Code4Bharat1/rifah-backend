import { RevenueLedgerEntry } from "./revenueLedgerEntry.model.js";
import { RevenueClaim } from "./revenueClaim.model.js";
import { RevenueSettlement } from "./revenueSettlement.model.js";
import { getChapterFilter } from "../../shared/utils/chapter-scope.js";
import { parsePagination, buildPaginationMeta } from "../../shared/utils/pagination.js";
import { round2 } from "./revenueShare.service.js";

/**
 * Builds a MongoDB filter for the ledger scoped to the requester's role, reusing the
 * existing chapter-scope utility wholesale (the ledger model's chapterId/chapter/state
 * fields are shaped specifically to match it) and layering the caller's own filters
 * (date range, state, chapter, revenueType, beneficiaryLevel, status) on top.
 */
const buildLedgerFilter = async (user, query = {}) => {
  const scopeFilter = await getChapterFilter(user, "direct_id");
  const filter = { ...scopeFilter };

  if (query.revenueType && query.revenueType !== "all") filter.revenueType = query.revenueType;
  if (query.beneficiaryLevel && query.beneficiaryLevel !== "all") filter.beneficiaryLevel = query.beneficiaryLevel;
  if (query.status && query.status !== "all") filter.status = query.status;
  if (query.chapterId) filter.chapterId = query.chapterId;
  if (query.state && query.state !== "all") filter.state = new RegExp(`^${String(query.state).trim()}$`, "i");
  if (query.accountingPeriod) filter.accountingPeriod = query.accountingPeriod;

  const dateFilter = {};
  if (query.startDate) {
    const d = new Date(query.startDate);
    if (!isNaN(d.getTime())) dateFilter.$gte = d;
  }
  if (query.endDate) {
    const d = new Date(query.endDate);
    if (!isNaN(d.getTime())) {
      d.setHours(23, 59, 59, 999);
      dateFilter.$lte = d;
    }
  }
  if (Object.keys(dateFilter).length > 0) filter.transactionDate = dateFilter;

  return filter;
};

export const listLedger = async (user, query = {}) => {
  const filter = await buildLedgerFilter(user, query);
  const { page, limit, skip } = parsePagination(query);

  const [entries, total] = await Promise.all([
    RevenueLedgerEntry.find(filter)
      .populate("chapterId", "name state")
      .populate("payerUserId", "name email")
      .populate("businessId", "name")
      .populate("eventId", "title")
      .sort({ transactionDate: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    RevenueLedgerEntry.countDocuments(filter),
  ]);

  return { entries, meta: buildPaginationMeta(total, page, limit) };
};

export const getLedgerEntryById = async (user, id) => {
  const scopeFilter = await getChapterFilter(user, "direct_id");
  const entry = await RevenueLedgerEntry.findOne({ _id: id, ...scopeFilter })
    .populate("chapterId", "name state")
    .populate("payerUserId", "name email")
    .populate("businessId", "name")
    .populate("eventId", "title")
    .populate("ruleId")
    .populate("claimId")
    .lean();
  return entry;
};

/**
 * Dashboard KPIs (spec §8): gross/GST/discounts/refunds, eligible base, allocations by
 * level, payable-by-Center per beneficiary, claims funnel, and a reconciliation check
 * (sum of allocations for a payment must equal its eligibleBase — guarded by the
 * rounding policy in revenueShare.service.js, surfaced here so a mismatch is visible
 * rather than silently wrong).
 */
export const getDashboard = async (user, query = {}) => {
  const filter = await buildLedgerFilter(user, query);

  const [totals, byLevel, byChapter, byState, claimsFunnel, reconciliation] = await Promise.all([
    RevenueLedgerEntry.aggregate([
      { $match: filter },
      {
        $group: {
          _id: null,
          grossAmount: { $sum: "$grossAmount" },
          gstAmount: { $sum: "$gstAmount" },
          eligibleBase: { $sum: { $cond: [{ $eq: ["$beneficiaryLevel", "central"] }, "$eligibleBase", 0] } },
          refundAmount: { $sum: "$refundAmount" },
          allocatedAmount: { $sum: "$allocatedAmount" },
          count: { $sum: 1 },
        },
      },
    ]),
    RevenueLedgerEntry.aggregate([
      { $match: filter },
      { $group: { _id: "$beneficiaryLevel", allocatedAmount: { $sum: "$allocatedAmount" } } },
    ]),
    RevenueLedgerEntry.aggregate([
      { $match: { ...filter, beneficiaryLevel: "chapter" } },
      {
        $group: {
          _id: "$chapterId",
          chapterName: { $first: "$chapter" },
          earned: { $sum: "$allocatedAmount" },
          outstanding: {
            $sum: { $cond: [{ $in: ["$status", ["payable", "partially_paid"]] }, "$allocatedAmount", 0] },
          },
        },
      },
      { $sort: { earned: -1 } },
    ]),
    RevenueLedgerEntry.aggregate([
      { $match: { ...filter, beneficiaryLevel: "state" } },
      {
        $group: {
          _id: "$state",
          earned: { $sum: "$allocatedAmount" },
          outstanding: {
            $sum: { $cond: [{ $in: ["$status", ["payable", "partially_paid"]] }, "$allocatedAmount", 0] },
          },
        },
      },
      { $sort: { earned: -1 } },
    ]),
    RevenueClaim.aggregate([{ $group: { _id: "$status", count: { $sum: 1 }, amount: { $sum: "$claimedAmount" } } }]),
    RevenueLedgerEntry.aggregate([
      { $match: filter },
      { $group: { _id: "$sourcePaymentId", eligibleBase: { $first: "$eligibleBase" }, allocated: { $sum: "$allocatedAmount" } } },
      { $project: { diff: { $subtract: ["$allocated", "$eligibleBase"] } } },
      { $match: { diff: { $ne: 0 } } },
    ]),
  ]);

  const t = totals[0] || { grossAmount: 0, gstAmount: 0, eligibleBase: 0, refundAmount: 0, allocatedAmount: 0, count: 0 };
  const levelMap = Object.fromEntries(byLevel.map((l) => [l._id, round2(l.allocatedAmount)]));

  return {
    totals: {
      grossAmount: round2(t.grossAmount),
      gstAmount: round2(t.gstAmount),
      eligibleRevenueBase: round2(t.eligibleBase),
      refundAmount: round2(t.refundAmount),
      totalAllocated: round2(t.allocatedAmount),
      ledgerEntryCount: t.count,
    },
    allocationsByLevel: {
      chapter: levelMap.chapter || 0,
      state: levelMap.state || 0,
      central: levelMap.central || 0,
    },
    payableByChapter: byChapter.map((c) => ({
      chapterId: c._id,
      chapterName: c.chapterName,
      earned: round2(c.earned),
      outstanding: round2(c.outstanding),
    })),
    payableByState: byState.map((s) => ({ state: s._id, earned: round2(s.earned), outstanding: round2(s.outstanding) })),
    claims: Object.fromEntries(claimsFunnel.map((c) => [c._id, { count: c.count, amount: round2(c.amount) }])),
    reconciliationExceptions: reconciliation.map((r) => ({
      sourcePaymentId: r._id,
      eligibleBase: round2(r.eligibleBase),
      allocated: round2(r.allocated),
      difference: round2(r.diff),
    })),
  };
};

export const exportLedgerRows = async (user, query = {}) => {
  // Exports must not be capped at listLedger's page-size limit (parsePagination clamps
  // to 1000) — query the full scoped+filtered set directly instead.
  const filter = await buildLedgerFilter(user, query);
  const entries = await RevenueLedgerEntry.find(filter)
    .populate("chapterId", "name state")
    .sort({ transactionDate: -1 })
    .lean();
  const headers = [
    "Date",
    "Period",
    "Revenue Type",
    "Beneficiary",
    "Chapter",
    "State",
    "Gross Amount",
    "GST",
    "Eligible Base",
    "Percentage",
    "Allocated Amount",
    "Status",
    "Source Payment",
  ];
  const rows = entries.map((e) => [
    new Date(e.transactionDate).toLocaleDateString("en-IN"),
    e.accountingPeriod,
    e.revenueType,
    e.beneficiaryLevel,
    e.chapterId?.name || e.chapter || "",
    e.state || "",
    e.grossAmount,
    e.gstAmount,
    e.eligibleBase,
    `${e.percentage}%`,
    e.allocatedAmount,
    e.status,
    String(e.sourcePaymentId),
  ]);
  return { headers, rows };
};

export const revenueReportService = {
  listLedger,
  getLedgerEntryById,
  getDashboard,
  exportLedgerRows,
};

export default revenueReportService;
