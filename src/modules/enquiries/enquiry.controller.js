import { enquiryService } from "./enquiry.service.js";
import { asyncHandler } from "../../shared/utils/async-handler.js";
import { ApiResponse } from "../../shared/utils/response.js";

import { UnauthorizedError } from "../../shared/errors/errors.js";
import { auditService } from "../audit/audit.service.js";

export const enquiryController = {
  createEnquiry: asyncHandler(async (req, res) => {
    if (!req.user) {
      const { Settings } = await import("../settings/settings.model.js");
      const settings = await Settings.findOne({ isSingleton: "global" });
      if (!settings || !settings.allowPublicEnquiryPosting) {
        throw new UnauthorizedError("You must be logged in to post an enquiry. Public posting is currently disabled.");
      }
    }

    const enquiry = await enquiryService.createEnquiry(req.body, req.user);
    
    // req.user might be undefined for public enquiries
    if (req.user) {
      await auditService.logAction({
        actor: req.user,
        action: "CREATE",
        targetModel: "Enquiry",
        targetId: enquiry._id || enquiry.id,
        summary: `Submitted new enquiry: ${enquiry.requirement?.substring(0, 30) || 'General Requirement'}...`,
        ipAddress: req.ip
      });
    }

    return ApiResponse.created(res, enquiry, "Enquiry submitted successfully");
  }),

  getMyEnquiries: asyncHandler(async (req, res) => {
    const { enquiries, meta } = await enquiryService.listBuyerEnquiries(req.user.id, req.query);
    return ApiResponse.success(res, enquiries, "My enquiries retrieved", 200, meta);
  }),

  getMyBusinessEnquiries: asyncHandler(async (req, res) => {
    const { enquiries, meta } = await enquiryService.listBusinessEnquiries(req.user.id, req.query);
    return ApiResponse.success(res, enquiries, "Direct business enquiries retrieved", 200, meta);
  }),

  getEnquiryById: asyncHandler(async (req, res) => {
    const { id } = req.params;
    const enquiry = await enquiryService.getEnquiryById(id, req.user);
    return ApiResponse.success(res, enquiry, "Enquiry details retrieved");
  }),

  listAllEnquiries: asyncHandler(async (req, res) => {
    const { enquiries, meta } = await enquiryService.listAllEnquiries(req.query, req.user);
    return ApiResponse.success(res, enquiries, "All enquiries retrieved", 200, meta);
  }),

  updateEnquiryStatus: asyncHandler(async (req, res) => {
    const { id } = req.params;
    const updated = await enquiryService.updateEnquiryStatus(id, req.body, req.user);
    
    await auditService.logAction({
      actor: req.user,
      action: "UPDATE",
      targetModel: "Enquiry",
      targetId: id,
      summary: `Enquiry status updated to ${req.body.status}`,
      ipAddress: req.ip
    });

    return ApiResponse.success(res, updated, "Enquiry status updated successfully");
  }),

  escalateEnquiry: asyncHandler(async (req, res) => {
    const { id } = req.params;
    const updated = await enquiryService.escalateEnquiry(id, req.user, req.body?.note);
    
    await auditService.logAction({
      actor: req.user,
      action: "UPDATE",
      targetModel: "Enquiry",
      targetId: id,
      summary: `Enquiry escalated to Head Office`,
      ipAddress: req.ip
    });

    return ApiResponse.success(res, updated, "Lead escalated to Head Office successfully");
  }),

  exportCsv: asyncHandler(async (req, res) => {
    const csvData = await enquiryService.exportCsv(req.query, req.user);
    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", "attachment; filename=leads_export.csv");
    return res.status(200).send(csvData);
  }),
};
