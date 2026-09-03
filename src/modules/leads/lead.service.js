import { Lead } from "./lead.model.js";
import { Enquiry } from "../enquiries/enquiry.model.js";
import { Business } from "../businesses/business.model.js";
import { User } from "../users/user.model.js";
import { emailService } from "../../infrastructure/email/email.service.js";
import { parsePagination, buildPaginationMeta } from "../../shared/utils/pagination.js";
import { NotFoundError, ForbiddenError } from "../../shared/errors/errors.js";

export const leadService = {
  /**
   * Route enquiry to one or multiple businesses (Admin / System)
   */
  routeEnquiryToBusinesses: async (enquiryId, businessIds) => {
    const enquiry = await Enquiry.findById(enquiryId);
    if (!enquiry) {
      throw new NotFoundError("Enquiry not found");
    }

    const createdLeads = [];
    for (const businessId of businessIds) {
      const existing = await Lead.findOne({ enquiry: enquiryId, business: businessId });
      if (!existing) {
        const lead = await Lead.create({
          enquiry: enquiryId,
          business: businessId,
          status: "New",
        });
        createdLeads.push(lead);

        try {
          const biz = await Business.findById(businessId);
          if (biz) {
            let targetEmail = null;
            let ownerName = biz.name;

            if (biz.owner) {
              const ownerUser = await User.findById(biz.owner);
              if (ownerUser?.email) {
                targetEmail = ownerUser.email;
                ownerName = ownerUser.name;
              }
            }

            if (!targetEmail && biz.email) {
              targetEmail = biz.email;
            }

            if (targetEmail) {
              await emailService.sendNewLeadEmail({
                email: targetEmail,
                businessOwnerName: ownerName,
                leadTitle: enquiry.title,
                category: enquiry.category,
                quantity: enquiry.quantity,
                budget: enquiry.budget,
                location: enquiry.city,
                buyerName: enquiry.requesterName,
              });
            }
          }
        } catch (err) {}
      }
    }

    enquiry.status = "Routed";
    await enquiry.save();

    return createdLeads;
  },

  /**
   * List workspace leads for a business
   */
  listBusinessLeads: async (businessId, queryParams = {}) => {
    const { page, limit, skip, sort } = parsePagination(queryParams);
    const filter = { business: businessId };

    if (queryParams.status && queryParams.status !== "All" && queryParams.status !== "undefined") {
      filter.status = new RegExp(`^${queryParams.status}$`, "i");
    }


    const [leads, total] = await Promise.all([
      Lead.find(filter)
        .populate("enquiry")
        .populate("business", "name slug phone email owner")
        .sort(sort || { createdAt: -1 })
        .skip(skip)
        .limit(limit),
      Lead.countDocuments(filter),
    ]);

    return {
      leads,
      meta: buildPaginationMeta(total, page, limit),
    };
  },

  /**
   * Get single lead detail
   */
  getLeadById: async (leadId, user) => {
    const lead = await Lead.findById(leadId)
      .populate("enquiry")
      .populate("business", "name slug phone email owner");

    if (!lead) {
      throw new NotFoundError("Lead not found");
    }

    return lead;
  },

  /**
   * Submit quotation for a lead (Business Owner)
   */
  submitQuotation: async (leadId, quotationData, user) => {
    const lead = await Lead.findById(leadId).populate("business");
    if (!lead) {
      throw new NotFoundError("Lead not found");
    }

    if (String(lead.business.owner) !== String(user.id)) {
      throw new ForbiddenError("You are not authorized to respond to this lead");
    }

    lead.quotation = {
      ...quotationData,
      submittedAt: new Date(),
    };
    lead.status = "Responded";
    lead.lastActivityAt = new Date();
    await lead.save();

    await Enquiry.findByIdAndUpdate(lead.enquiry, {
      $inc: { responsesCount: 1 },
      status: "Responded",
    });

    return lead;
  },

  /**
   * Update lead CRM pipeline stage
   */
  updateLeadStatus: async (leadId, { status, notes }) => {
    const updates = { status, lastActivityAt: new Date() };
    if (notes !== undefined) updates.notes = notes;

    const lead = await Lead.findByIdAndUpdate(leadId, updates, { new: true }).populate("enquiry");
    if (!lead) {
      throw new NotFoundError("Lead not found");
    }
    return lead;
  },
};
