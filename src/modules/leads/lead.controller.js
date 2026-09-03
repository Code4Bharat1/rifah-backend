import { leadService } from "./lead.service.js";
import { businessService } from "../businesses/business.service.js";
import { asyncHandler } from "../../shared/utils/async-handler.js";
import { ApiResponse } from "../../shared/utils/response.js";
import { NotFoundError } from "../../shared/errors/errors.js";

export const leadController = {
  routeLead: asyncHandler(async (req, res) => {
    const { enquiryId, businessIds } = req.body;
    const leads = await leadService.routeEnquiryToBusinesses(enquiryId, businessIds);
    return ApiResponse.created(res, leads, "Enquiry routed to businesses successfully");
  }),

  getMyLeads: asyncHandler(async (req, res) => {
    let business = await businessService.getBusinessByOwnerId(req.user.id);
    if (!business) {
      business = (await Business.findOne({ email: req.user.email })) || (await Business.findOne());
    }
    if (!business) {
      return ApiResponse.success(res, [], "No business profile found", 200, { total: 0 });
    }
    const { leads, meta } = await leadService.listBusinessLeads(business._id, req.query);
    return ApiResponse.success(res, leads, "Business leads retrieved", 200, meta);
  }),

  getLeadById: asyncHandler(async (req, res) => {
    const { id } = req.params;
    const lead = await leadService.getLeadById(id, req.user);
    return ApiResponse.success(res, lead, "Lead details retrieved");
  }),

  submitQuotation: asyncHandler(async (req, res) => {
    const { id } = req.params;
    const updated = await leadService.submitQuotation(id, req.body, req.user);
    return ApiResponse.success(res, updated, "Quotation submitted successfully");
  }),

  updateLeadStatus: asyncHandler(async (req, res) => {
    const { id } = req.params;
    const updated = await leadService.updateLeadStatus(id, req.body);
    return ApiResponse.success(res, updated, "Lead status updated successfully");
  }),

  exportCsv: asyncHandler(async (req, res) => {
    const { Lead } = await import("./lead.model.js");
    const leads = await Lead.find().populate("business", "name city chapter").populate("enquiry", "category requirement source status");
    
    const headers = ["Business Name", "Chapter", "City", "Enquiry Category", "Enquiry Source", "Lead Status", "Date"];
    const rows = leads.map(lead => [
      `"${lead.business?.name || ''}"`,
      `"${lead.business?.chapter || ''}"`,
      `"${lead.business?.city || ''}"`,
      `"${lead.enquiry?.category || ''}"`,
      `"${lead.enquiry?.source || ''}"`,
      `"${lead.status || ''}"`,
      `"${new Date(lead.createdAt).toLocaleDateString()}"`
    ]);

    const csvData = [headers.join(","), ...rows.map(r => r.join(","))].join("\n");
    
    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", 'attachment; filename="leads_export.csv"');
    return res.status(200).send(csvData);
  }),
};
