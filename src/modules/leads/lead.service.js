import { Lead } from "./lead.model.js";
import { Enquiry } from "../enquiries/enquiry.model.js";
import { Business } from "../businesses/business.model.js";
import { User } from "../users/user.model.js";
import { emailService } from "../../infrastructure/email/email.service.js";
import { notificationService } from "../notifications/notification.service.js";
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

            // Notify Business Owner
            if (biz.owner) {
              await notificationService.createNotification({
                recipientId: biz.owner,
                type: "Lead",
                title: "New Lead Assigned",
                body: `You have received a new lead matching your business: "${enquiry.title}".`,
                link: "/biz/leads",
                entityId: lead._id
              });
            }
          }
        } catch (err) {
          console.error("Error sending lead notification/email:", err);
        }
      }
    }

    enquiry.status = "Routed";
    await enquiry.save();

    // Notify the Customer (Buyer) who created the enquiry
    if (enquiry.requester && createdLeads.length > 0) {
      try {
        await notificationService.createNotification({
          recipientId: enquiry.requester,
          type: "System",
          title: "Enquiry Routed to Suppliers",
          body: `Your enquiry "${enquiry.title}" has been reviewed and routed to verified suppliers.`,
          link: "/me/enquiries",
          entityId: enquiry._id
        });
      } catch (err) {
        console.error("Error notifying customer about routed enquiry:", err);
      }
    }

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

    const businessOwnerId = String(lead.business?.owner?._id || lead.business?.owner || "");
    const businessId = String(lead.business?._id || lead.business || "");
    const isOwner = businessOwnerId && businessOwnerId === String(user.id);
    const isSameBusiness = user.businessId && String(user.businessId) === businessId;
    const isAdmin = ["super_admin", "secretariat", "chapter_admin"].includes(user.role);

    if (!isOwner && !isSameBusiness && !isAdmin && businessOwnerId) {
      throw new ForbiddenError("You are not authorized to respond to this lead");
    }

    lead.quotation = {
      ...quotationData,
      amount: String(quotationData.amount || "").trim(),
      notes: quotationData.notes || quotationData.terms || "",
      submittedAt: new Date(),
    };
    lead.status = "Responded";
    lead.lastActivityAt = new Date();
    await lead.save();

    const updatedEnquiry = await Enquiry.findByIdAndUpdate(lead.enquiry, {
      $inc: { responsesCount: 1 },
      status: "Responded",
    });

    if (updatedEnquiry && updatedEnquiry.requester) {
      try {
        await notificationService.createNotification({
          recipientId: updatedEnquiry.requester,
          type: "Quotation",
          title: "New Quotation Received",
          body: `${lead.business?.name || 'A business'} has submitted a quotation for your requirement "${updatedEnquiry.title}".`,
          entityId: lead._id,
          link: "/me/enquiries"
        });
      } catch (err) {
        console.error("Failed to create quotation notification:", err);
      }
    }

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

  /**
   * Get all leads (quotations) for a specific enquiry (Customer / Buyer)
   */
  getLeadsForEnquiry: async (enquiryId, userId) => {
    const enquiry = await Enquiry.findById(enquiryId);
    if (!enquiry) {
      throw new NotFoundError("Enquiry not found");
    }
    
    // Verify requester is the one asking
    if (String(enquiry.requester) !== String(userId)) {
      throw new ForbiddenError("You can only view quotations for your own enquiries");
    }

    // Return leads that have responded with a quotation
    const leads = await Lead.find({ 
      enquiry: enquiryId,
      status: { $in: ["Responded", "Won", "Lost", "Closed"] }
    }).populate("business", "name slug phone email owner logo");

    return leads;
  },
};
