import { asyncHandler } from "../../shared/utils/async-handler.js";
import { ApiResponse } from "../../shared/utils/response.js";
import { pdfService } from "../../infrastructure/pdf/pdf.service.js";
import { revenueReportService } from "./revenueReport.service.js";
import { revenueClaimService } from "./revenueClaim.service.js";
import { revenueShareRuleService } from "./revenueShareRule.service.js";
import { NotFoundError } from "../../shared/errors/errors.js";

async function sendTabularPdf(res, { title, subtitle, headers, rows, filename }) {
  const pdfBuffer = await pdfService.generateTabularReportBuffer({ title, subtitle, headers, rows });
  res.set({
    "Content-Type": "application/pdf",
    "Content-Disposition": `attachment; filename="${filename}"`,
    "Content-Length": pdfBuffer.length,
  });
  res.end(pdfBuffer);
}

function sendCsv(res, { headers, rows, filename }) {
  const csvData = [
    headers.join(","),
    ...rows.map((r) => r.map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`).join(",")),
  ].join("\n");
  res.setHeader("Content-Type", "text/csv");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  return res.status(200).send(csvData);
}

export const revenueSharingController = {
  listLedger: asyncHandler(async (req, res) => {
    const result = await revenueReportService.listLedger(req.user, req.query);
    return ApiResponse.success(res, result.entries, "Ledger entries retrieved", 200, result.meta);
  }),

  getLedgerEntry: asyncHandler(async (req, res) => {
    const entry = await revenueReportService.getLedgerEntryById(req.user, req.params.id);
    if (!entry) throw new NotFoundError("Ledger entry not found or not in your scope");
    return ApiResponse.success(res, entry, "Ledger entry retrieved");
  }),

  getBalance: asyncHandler(async (req, res) => {
    const { level, id, period } = req.query;
    const balance = period
      ? await revenueClaimService.getOrgPeriodSummary(level, id, period)
      : await revenueClaimService.getOrgBalance(level, id);
    return ApiResponse.success(res, balance, "Balance retrieved");
  }),

  getDashboard: asyncHandler(async (req, res) => {
    const dashboard = await revenueReportService.getDashboard(req.user, req.query);
    return ApiResponse.success(res, dashboard, "Dashboard data retrieved");
  }),

  exportLedger: asyncHandler(async (req, res) => {
    const { headers, rows } = await revenueReportService.exportLedgerRows(req.user, req.query);
    const format = (req.query.format || "csv").toLowerCase();
    const filename = `revenue_ledger_${new Date().toISOString().split("T")[0]}`;
    if (format === "pdf") {
      return sendTabularPdf(res, {
        title: "RIFAH Revenue Sharing Ledger",
        subtitle: [req.query.startDate, req.query.endDate].filter(Boolean).join(" – "),
        headers,
        rows,
        filename: `${filename}.pdf`,
      });
    }
    return sendCsv(res, { headers, rows, filename: `${filename}.csv` });
  }),

  createClaim: asyncHandler(async (req, res) => {
    const claim = await revenueClaimService.createClaim(req.user, req.body);
    return ApiResponse.created(res, claim, "Claim created");
  }),

  listClaims: asyncHandler(async (req, res) => {
    const claims = await revenueClaimService.listClaims(req.user, req.query);
    return ApiResponse.success(res, claims, "Claims retrieved");
  }),

  getClaim: asyncHandler(async (req, res) => {
    const claim = await revenueClaimService.getClaimById(req.user, req.params.id);
    return ApiResponse.success(res, claim, "Claim retrieved");
  }),

  submitClaim: asyncHandler(async (req, res) => {
    const claim = await revenueClaimService.submitClaim(req.user, req.params.id);
    return ApiResponse.success(res, claim, "Claim submitted");
  }),

  reviewClaim: asyncHandler(async (req, res) => {
    const claim = await revenueClaimService.reviewClaim(req.user, req.params.id);
    return ApiResponse.success(res, claim, "Claim marked under review");
  }),

  approveClaim: asyncHandler(async (req, res) => {
    const claim = await revenueClaimService.approveClaim(req.user, req.params.id);
    return ApiResponse.success(res, claim, "Claim approved");
  }),

  rejectClaim: asyncHandler(async (req, res) => {
    const claim = await revenueClaimService.rejectClaim(req.user, req.params.id, req.body?.reason);
    return ApiResponse.success(res, claim, "Claim rejected");
  }),

  cancelClaim: asyncHandler(async (req, res) => {
    const claim = await revenueClaimService.cancelClaim(req.user, req.params.id);
    return ApiResponse.success(res, claim, "Claim cancelled");
  }),

  recordSettlement: asyncHandler(async (req, res) => {
    const settlement = await revenueClaimService.recordSettlement(req.user, req.params.id, req.body);
    return ApiResponse.created(res, settlement, "Settlement recorded");
  }),

  listRules: asyncHandler(async (req, res) => {
    const rules = await revenueShareRuleService.listRules(req.query.revenueType);
    return ApiResponse.success(res, rules, "Rules retrieved");
  }),

  createRuleVersion: asyncHandler(async (req, res) => {
    const rule = await revenueShareRuleService.createRuleVersion(req.user, req.body);
    return ApiResponse.created(res, rule, "New rule version published");
  }),
};

export default revenueSharingController;
