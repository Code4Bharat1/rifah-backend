import { reportService } from "./report.service.js";
import { businessService } from "../businesses/business.service.js";
import { asyncHandler } from "../../shared/utils/async-handler.js";
import { ApiResponse } from "../../shared/utils/response.js";
import { NotFoundError } from "../../shared/errors/errors.js";

export const reportController = {
  getBusinessAnalytics: asyncHandler(async (req, res) => {
    const business = await businessService.getBusinessByOwnerId(req.user.id);
    if (!business) {
      throw new NotFoundError("No business found for this account");
    }
    const stats = await reportService.getBusinessAnalytics(business._id);
    return ApiResponse.success(res, stats, "Business analytics retrieved");
  }),

  getAdminOverview: asyncHandler(async (req, res) => {
    const stats = await reportService.getAdminOverview();
    return ApiResponse.success(res, stats, "Chamber KPI metrics retrieved");
  }),

  exportAdminCsv: asyncHandler(async (req, res) => {
    const stats = await reportService.getAdminOverview();
    const headers = ["Metric", "Value"];
    const rows = [
      ["Total Businesses", stats.kpi.totalBusinesses],
      ["Total Enquiries", stats.kpi.totalEnquiries],
      ["Total Chapters", stats.kpi.totalChapters],
    ];
    stats.membershipGrowth.forEach((m) => rows.push([`Growth ${m.month}`, m.count]));
    stats.chaptersDistribution.forEach((c) => rows.push([`Chapter ${c.chapter}`, c.count]));

    const csvData = [headers.join(","), ...rows.map(r => r.join(","))].join("\n");
    
    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", 'attachment; filename="admin_reports.csv"');
    return res.status(200).send(csvData);
  }),
};
