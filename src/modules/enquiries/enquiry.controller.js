import { enquiryService } from "./enquiry.service.js";
import { asyncHandler } from "../../shared/utils/async-handler.js";
import { ApiResponse } from "../../shared/utils/response.js";

import { UnauthorizedError } from "../../shared/errors/errors.js";

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
    return ApiResponse.created(res, enquiry, "Enquiry submitted successfully");
  }),

  getMyEnquiries: asyncHandler(async (req, res) => {
    const { enquiries, meta } = await enquiryService.listBuyerEnquiries(req.user.id, req.query);
    return ApiResponse.success(res, enquiries, "My enquiries retrieved", 200, meta);
  }),

  getEnquiryById: asyncHandler(async (req, res) => {
    const { id } = req.params;
    const enquiry = await enquiryService.getEnquiryById(id);
    return ApiResponse.success(res, enquiry, "Enquiry details retrieved");
  }),

  listAllEnquiries: asyncHandler(async (req, res) => {
    const { enquiries, meta } = await enquiryService.listAllEnquiries(req.query, req.user);
    return ApiResponse.success(res, enquiries, "All enquiries retrieved", 200, meta);
  }),

  updateEnquiryStatus: asyncHandler(async (req, res) => {
    const { id } = req.params;
    const updated = await enquiryService.updateEnquiryStatus(id, req.body);
    return ApiResponse.success(res, updated, "Enquiry status updated successfully");
  }),
};
