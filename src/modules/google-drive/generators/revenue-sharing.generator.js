import ExcelJS from "exceljs";
import { RevenueLedgerEntry } from "../../revenue-sharing/revenueLedgerEntry.model.js";
import { applyWorksheetStyles, formatSafeDate } from "./generator-styles.js";

/**
 * Generates the RIFAH_Revenue_Sharing.xlsx Excel workbook
 */
export async function generateRevenueSharingWorkbook() {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "RIFAH Chamber Platform";
  workbook.lastModifiedBy = "RIFAH Sync Engine";
  workbook.created = new Date();
  workbook.modified = new Date();

  // --- SHEET 1: Detailed Ledger Allocations ---
  const sheet1 = workbook.addWorksheet("Ledger Allocations");

  sheet1.columns = [
    { header: "Entry ID", key: "id", width: 26 },
    { header: "Transaction Date", key: "transactionDate", width: 18 },
    { header: "Period", key: "accountingPeriod", width: 14 },
    { header: "Revenue Type", key: "revenueType", width: 16 },
    { header: "Payer Name", key: "payerName", width: 24 },
    { header: "Payer Email", key: "payerEmail", width: 26 },
    { header: "Business", key: "businessName", width: 24 },
    { header: "Chapter", key: "chapter", width: 20 },
    { header: "State", key: "state", width: 18 },
    { header: "Beneficiary Level", key: "beneficiaryLevel", width: 18 },
    { header: "Gross Amount (₹)", key: "grossAmount", width: 18 },
    { header: "Eligible Base (₹)", key: "eligibleBase", width: 18 },
    { header: "Share %", key: "percentage", width: 12 },
    { header: "Allocated Share (₹)", key: "allocatedAmount", width: 20 },
    { header: "Paid / Settled (₹)", key: "paidAmount", width: 18 },
    { header: "Outstanding (₹)", key: "outstanding", width: 18 },
    { header: "Settlement Status", key: "status", width: 18 },
    { header: "Paying Org", key: "payingOrgLevel", width: 16 },
  ];

  const entries = await RevenueLedgerEntry.find({})
    .populate("payerUserId", "name email phone")
    .populate("businessId", "name")
    .sort({ transactionDate: -1 })
    .lean();

  const levelSummary = {
    central: { allocated: 0, paid: 0, count: 0 },
    state: { allocated: 0, paid: 0, count: 0 },
    chapter: { allocated: 0, paid: 0, count: 0 },
  };

  entries.forEach((e) => {
    const gross = Number(e.grossAmount) || 0;
    const base = Number(e.eligibleBase) || 0;
    const alloc = Number(e.allocatedAmount) || 0;
    const paid = Number(e.paidAmount) || 0;
    const outstanding = Math.max(0, alloc - paid);

    const bLevel = (e.beneficiaryLevel || "central").toLowerCase();
    if (!levelSummary[bLevel]) {
      levelSummary[bLevel] = { allocated: 0, paid: 0, count: 0 };
    }
    levelSummary[bLevel].allocated += alloc;
    levelSummary[bLevel].paid += paid;
    levelSummary[bLevel].count += 1;

    sheet1.addRow({
      id: String(e._id),
      transactionDate: formatSafeDate(e.transactionDate, false),
      accountingPeriod: e.accountingPeriod || "",
      revenueType: e.revenueType === "membership" ? "Membership Fee" : (e.revenueType === "event" ? "Event Ticket" : e.revenueType),
      payerName: e.payerUserId?.name || "",
      payerEmail: e.payerUserId?.email || "",
      businessName: e.businessId?.name || "",
      chapter: e.chapter || "",
      state: e.state || "",
      beneficiaryLevel: (e.beneficiaryLevel || "").toUpperCase(),
      grossAmount: gross,
      eligibleBase: base,
      percentage: e.percentage || 0,
      allocatedAmount: alloc,
      paidAmount: paid,
      outstanding: outstanding,
      status: (e.status || "payable").toUpperCase(),
      payingOrgLevel: (e.payingOrgLevel || "central").toUpperCase(),
    });
  });

  applyWorksheetStyles(sheet1, "047857"); // Emerald-700 header

  // --- SHEET 2: Summary by Beneficiary Level & Balances ---
  const sheet2 = workbook.addWorksheet("Summary by Level");

  sheet2.columns = [
    { header: "Beneficiary Tier", key: "tier", width: 24 },
    { header: "Total Allocations Count", key: "count", width: 24 },
    { header: "Total Allocated (₹)", key: "totalAllocated", width: 24 },
    { header: "Total Settled / Paid (₹)", key: "totalPaid", width: 24 },
    { header: "Total Outstanding (₹)", key: "totalOutstanding", width: 24 },
  ];

  ["central", "state", "chapter"].forEach((tierKey) => {
    const data = levelSummary[tierKey] || { allocated: 0, paid: 0, count: 0 };
    const outstanding = Math.max(0, data.allocated - data.paid);
    sheet2.addRow({
      tier: `${tierKey.toUpperCase()} LEVEL`,
      count: data.count,
      totalAllocated: data.allocated,
      totalPaid: data.paid,
      totalOutstanding: outstanding,
    });
  });

  applyWorksheetStyles(sheet2, "065F46"); // Dark Emerald header

  const buffer = await workbook.xlsx.writeBuffer();
  return {
    buffer: Buffer.from(buffer),
    fileName: "RIFAH_Revenue_Sharing.xlsx",
    rowCount: entries.length,
  };
}
