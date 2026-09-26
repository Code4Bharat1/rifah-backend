import { reportService } from "./report.service.js";
import { businessService } from "../businesses/business.service.js";
import { asyncHandler } from "../../shared/utils/async-handler.js";
import { ApiResponse } from "../../shared/utils/response.js";
import { NotFoundError } from "../../shared/errors/errors.js";
import { pdfService } from "../../infrastructure/pdf/pdf.service.js";

async function sendTabularPdf(res, { title, subtitle, headers, rows, filename }) {
  const pdfBuffer = await pdfService.generateTabularReportBuffer({ title, subtitle, headers, rows });
  res.set({
    "Content-Type": "application/pdf",
    "Content-Disposition": `attachment; filename="${filename}"`,
    "Content-Length": pdfBuffer.length,
  });
  res.end(pdfBuffer);
}

export const reportController = {
  getBusinessAnalytics: asyncHandler(async (req, res) => {
    const { Business } = await import("../businesses/business.model.js");
    let business = await businessService.getBusinessByOwnerId(req.user.id);
    if (!business && req.user.businessId) {
      business = await Business.findById(req.user.businessId);
    }
    if (!business) {
      business = (await Business.findOne({ email: req.user.email })) || (await Business.findOne());
    }
    if (!business) {
      throw new NotFoundError("No business found for this account");
    }
    const stats = await reportService.getBusinessAnalytics(business._id);
    return ApiResponse.success(res, stats, "Business analytics retrieved");
  }),

  getPublicStats: asyncHandler(async (req, res) => {
    const stats = await reportService.getPublicStats();
    return ApiResponse.success(res, stats, "Public chamber stats retrieved");
  }),

  getAdminOverview: asyncHandler(async (req, res) => {
    const stats = await reportService.getAdminOverview(req.user);
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

    if (req.query.format === "pdf") {
      return sendTabularPdf(res, { title: "RIFAH Chamber Overview Report", headers, rows, filename: "admin_reports.pdf" });
    }

    const csvData = [headers.join(","), ...rows.map(r => r.join(","))].join("\n");

    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", 'attachment; filename="admin_reports.csv"');
    return res.status(200).send(csvData);
  }),

  exportRevenue: asyncHandler(async (req, res) => {
    const { startDate, endDate, format, filter } = req.query;
    const data = await reportService.exportRevenueData(startDate, endDate, req.user, filter);
    if (format === "json") return ApiResponse.success(res, data, "Revenue data retrieved");
    
    const filterLabel = filter && filter !== "All" ? filter : "Revenue";
    const reportTitle = `${filterLabel} Report`;
    const baseFilename = filter && filter !== "All" ? `${filter.toLowerCase().replace(/\s+/g, "_")}_revenue_report` : "revenue_report";

    if (format === "pdf") {
      return sendTabularPdf(res, { 
        title: reportTitle, 
        subtitle: [startDate, endDate].filter(Boolean).join(" – "), 
        headers: data.headers, 
        rows: data.rows, 
        filename: `${baseFilename}.pdf` 
      });
    }

    const csvData = [
      data.headers.join(","),
      ...data.rows.map(r => r.map(c => `"${String(c ?? '').replace(/"/g, '""')}"`).join(","))
    ].join("\n");
    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", `attachment; filename="${baseFilename}.csv"`);
    return res.status(200).send(csvData);
  }),

  exportBusinesses: asyncHandler(async (req, res) => {
    const { startDate, endDate, format } = req.query;
    const data = await reportService.exportBusinessesData(startDate, endDate, req.user);
    if (format === "json") return ApiResponse.success(res, data, "Businesses data retrieved");
    if (format === "pdf") {
      return sendTabularPdf(res, { title: "Businesses Report", subtitle: [startDate, endDate].filter(Boolean).join(" – "), headers: data.headers, rows: data.rows, filename: "businesses_report.pdf" });
    }

    const csvData = [data.headers.join(","), ...data.rows.map(r => r.map(c => `"${c}"`).join(","))].join("\n");
    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", 'attachment; filename="businesses_report.csv"');
    return res.status(200).send(csvData);
  }),

  exportMemberships: asyncHandler(async (req, res) => {
    const { startDate, endDate, format, filter } = req.query;
    const data = await reportService.exportMembershipsData(startDate, endDate, req.user, filter);
    if (format === "json") return ApiResponse.success(res, data, "Memberships data retrieved");
    
    const filterLabel = filter && filter !== "Membership" && filter !== "All" ? filter : "Memberships";
    const reportTitle = filter === "Event Registrations" ? "Event Registrations Report" : `${filterLabel} Report`;
    const baseFilename = filter ? `${filter.toLowerCase().replace(/\s+/g, "_")}_report` : "memberships_report";

    if (format === "pdf") {
      return sendTabularPdf(res, { 
        title: reportTitle, 
        subtitle: [startDate, endDate].filter(Boolean).join(" – "), 
        headers: data.headers, 
        rows: data.rows, 
        filename: `${baseFilename}.pdf` 
      });
    }

    const csvData = [
      data.headers.join(","),
      ...data.rows.map(r => r.map(c => `"${String(c ?? '').replace(/"/g, '""')}"`).join(","))
    ].join("\n");
    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", `attachment; filename="${baseFilename}.csv"`);
    return res.status(200).send(csvData);
  }),

  exportLeads: asyncHandler(async (req, res) => {
    const { startDate, endDate, format } = req.query;
    const data = await reportService.exportLeadsData(startDate, endDate, req.user);
    if (format === "json") return ApiResponse.success(res, data, "Leads data retrieved");
    if (format === "pdf") {
      return sendTabularPdf(res, { title: "Leads Report", subtitle: [startDate, endDate].filter(Boolean).join(" – "), headers: data.headers, rows: data.rows, filename: "leads_report.pdf" });
    }

    const csvData = [data.headers.join(","), ...data.rows.map(r => r.map(c => `"${c}"`).join(","))].join("\n");
    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", 'attachment; filename="leads_report.csv"');
    return res.status(200).send(csvData);
  }),

  getEventsAnalytics: asyncHandler(async (req, res) => {
    const data = await reportService.getEventsAnalyticsData(req.user, req.query);
    if (req.query.format === "pdf") {
      const headers = ["Event", "Date", "Chapter", "Status", "Registered", "Attended", "Attendance Rate", "Health"];
      const rows = (data.events || []).map((e) => [
        e.title, e.date, e.chapter, e.status, e.registeredCount, e.attendedCount, `${e.attendanceRate}%`, e.health,
      ]);
      return sendTabularPdf(res, {
        title: "Events Analytics Report",
        subtitle: `${data.kpis?.totalEvents || 0} events  •  ${data.kpis?.overallAttendanceRate || 0}% overall attendance`,
        headers,
        rows,
        filename: "events_analytics_report.pdf",
      });
    }
    return ApiResponse.success(res, data, "Event analytics retrieved successfully");
  }),
};
