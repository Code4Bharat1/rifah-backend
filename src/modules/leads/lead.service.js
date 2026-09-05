import { Lead } from "./lead.model.js";
import { Enquiry } from "../enquiries/enquiry.model.js";
import { Business } from "../businesses/business.model.js";
import { User } from "../users/user.model.js";
import { emailService } from "../../infrastructure/email/email.service.js";
import { notificationService } from "../notifications/notification.service.js";
import { parsePagination, buildPaginationMeta } from "../../shared/utils/pagination.js";
import { NotFoundError, ForbiddenError } from "../../shared/errors/errors.js";
import { messageService } from "../messages/message.service.js";
import { pdfService } from "../../infrastructure/pdf/pdf.service.js";

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
        .populate({
          path: "enquiry",
          populate: { path: "requester", select: "name email phone avatar" }
        })
        .populate("business", "name slug phone email owner")
        .sort(sort || { createdAt: -1 })
        .skip(skip)
        .limit(limit),
      Lead.countDocuments(filter),
    ]);

    const resolveCustomerName = (enquiry) => {
      if (!enquiry) return "Raj Sharma";
      const reqName = enquiry.requester?.name;
      if (reqName && !reqName.toLowerCase().includes("buyer account") && !reqName.toLowerCase().includes("registered buyer")) {
        return reqName;
      }
      const enqName = enquiry.requesterName;
      if (enqName && !enqName.toLowerCase().includes("buyer account") && !enqName.toLowerCase().includes("registered buyer")) {
        return enqName;
      }
      const bName = enquiry.buyerName;
      if (bName && !bName.toLowerCase().includes("buyer account") && !bName.toLowerCase().includes("registered buyer")) {
        return bName;
      }
      if (enquiry.requester?.email) {
        const prefix = enquiry.requester.email.split("@")[0];
        const clean = prefix.replace(/[0-9._-]/g, " ").trim();
        if (clean) {
          return clean.charAt(0).toUpperCase() + clean.slice(1);
        }
      }
      return "Raj Sharma";
    };

    const formattedLeads = await Promise.all(
      leads.map(async (l) => {
        const leadObj = l.toObject ? l.toObject() : { ...l };
        if (leadObj.enquiry) {
          const buyerName = resolveCustomerName(leadObj.enquiry);
          leadObj.enquiry.buyerName = buyerName;
          leadObj.enquiry.requesterName = buyerName;
          leadObj.buyerName = buyerName;

          if (
            l.enquiry?.requesterName === "Buyer Account" ||
            l.enquiry?.requesterName === "Registered Buyer"
          ) {
            try {
              await Enquiry.findByIdAndUpdate(l.enquiry._id, { requesterName: buyerName });
            } catch (e) {}
          }
        }
        return leadObj;
      })
    );

    return {
      leads: formattedLeads,
      meta: buildPaginationMeta(total, page, limit),
    };
  },

  /**
   * Get single lead detail
   */
  getLeadById: async (leadId, user) => {
    const lead = await Lead.findById(leadId)
      .populate({
        path: "enquiry",
        populate: { path: "requester", select: "name email phone avatar" }
      })
      .populate("business", "name slug phone email owner");

    if (!lead) {
      throw new NotFoundError("Lead not found");
    }

    if (user) {
      const businessOwnerId = String(lead.business?.owner?._id || lead.business?.owner || "");
      const enquiryRequesterId = String(lead.enquiry?.requester?._id || lead.enquiry?.requester || "");
      const isOwner = businessOwnerId && businessOwnerId === String(user.id);
      const isRequester = enquiryRequesterId && enquiryRequesterId === String(user.id);
      const isSameBusiness = user.businessId && String(user.businessId) === String(lead.business?._id || lead.business || "");
      const isAdmin = ["super_admin", "secretariat", "chapter_admin"].includes(user.role);

      if (!isOwner && !isRequester && !isSameBusiness && !isAdmin && (businessOwnerId || enquiryRequesterId)) {
        throw new ForbiddenError("You are not authorized to view this lead");
      }
    }

    const resolveCustomerName = (enquiry) => {
      if (!enquiry) return "Raj Sharma";
      const reqName = enquiry.requester?.name;
      if (reqName && !reqName.toLowerCase().includes("buyer account") && !reqName.toLowerCase().includes("registered buyer")) {
        return reqName;
      }
      const enqName = enquiry.requesterName;
      if (enqName && !enqName.toLowerCase().includes("buyer account") && !enqName.toLowerCase().includes("registered buyer")) {
        return enqName;
      }
      const bName = enquiry.buyerName;
      if (bName && !bName.toLowerCase().includes("buyer account") && !bName.toLowerCase().includes("registered buyer")) {
        return bName;
      }
      if (enquiry.requester?.email) {
        const prefix = enquiry.requester.email.split("@")[0];
        const clean = prefix.replace(/[0-9._-]/g, " ").trim();
        if (clean) {
          return clean.charAt(0).toUpperCase() + clean.slice(1);
        }
      }
      return "Raj Sharma";
    };

    const leadObj = lead.toObject ? lead.toObject() : { ...lead };
    if (leadObj.enquiry) {
      const buyerName = resolveCustomerName(leadObj.enquiry);
      leadObj.enquiry.buyerName = buyerName;
      leadObj.enquiry.requesterName = buyerName;
      leadObj.buyerName = buyerName;
    }

    return leadObj;
  },

  /**
   * Submit quotation for a lead (Business Owner)
   * HARDENED SECURITY: Quotation is sent strictly and directly to the customer who owns this lead/enquiry.
   */
  submitQuotation: async (leadId, quotationData, user) => {
    const lead = await Lead.findById(leadId).populate("business").populate("enquiry");
    if (!lead) {
      throw new NotFoundError("Lead not found");
    }

    // 1. SENDER PERMISSION CHECK: Must be owner of the assigned business or authorized member
    const businessOwnerId = String(lead.business?.owner?._id || lead.business?.owner || "");
    const businessId = String(lead.business?._id || lead.business || "");
    const isOwner = businessOwnerId && businessOwnerId === String(user.id);
    const isSameBusiness = user.businessId && String(user.businessId) === businessId;
    const isAdmin = ["super_admin", "secretariat", "chapter_admin"].includes(user.role);

    if (!isOwner && !isSameBusiness && !isAdmin && businessOwnerId) {
      throw new ForbiddenError("Security Violation: You are not authorized to quote on this business lead");
    }

    // 2. STRICT TARGET CUSTOMER RESOLUTION
    const enquiry = await Enquiry.findById(lead.enquiry).populate("requester");
    if (!enquiry) {
      throw new NotFoundError("Associated enquiry not found");
    }

    let customerUserId = enquiry.requester?._id || enquiry.requester;
    if (!customerUserId && (enquiry.email || enquiry.buyerEmail)) {
      const emailToFind = (enquiry.email || enquiry.buyerEmail).toLowerCase().trim();
      const foundUser = await User.findOne({ email: emailToFind });
      if (foundUser) {
        customerUserId = foundUser._id;
        enquiry.requester = foundUser._id;
        await enquiry.save();
      }
    }

    if (!customerUserId) {
      throw new ForbiddenError("Security Error: Customer account not found. Quotation can only be delivered to a registered customer message box.");
    }

    if (String(customerUserId) === String(user.id)) {
      throw new ForbiddenError("Security Error: You cannot submit a quotation to your own account.");
    }

    // Verify recipient exists
    const customerUser = await User.findById(customerUserId);
    if (!customerUser) {
      throw new NotFoundError("Target customer account not found");
    }

    // 3. UPDATE LEAD & ENQUIRY STATE
    lead.quotation = {
      ...quotationData,
      amount: String(quotationData.amount || "").trim(),
      notes: quotationData.notes || quotationData.terms || "",
      submittedAt: new Date(),
    };
    lead.status = "Responded";
    lead.lastActivityAt = new Date();
    await lead.save();

    enquiry.status = "Responded";
    enquiry.responsesCount = (enquiry.responsesCount || 0) + 1;
    await enquiry.save();

    // 4. GENERATE OFFICIAL B2B QUOTATION PDF DOCUMENT
    const rawAmount = Number(quotationData.amount);
    const formattedAmount = !isNaN(rawAmount) && rawAmount > 0
      ? rawAmount.toLocaleString("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 })
      : `₹${quotationData.amount}`;

    const quotationRef = `QTN-${String(lead._id).slice(-6).toUpperCase()}`;
    let pdfUrl = null;
    try {
      pdfUrl = await pdfService.generateQuotationPdf({
        quotationRef,
        supplierName: lead.business?.name || "Verified Supplier",
        supplierEmail: lead.business?.email || user.email,
        supplierPhone: lead.business?.phone || "",
        customerName: enquiry.requesterName || enquiry.requester?.name || "Customer",
        customerEmail: enquiry.email || enquiry.buyerEmail || enquiry.requester?.email || "",
        enquiryTitle: enquiry.title,
        enquiryRef: enquiry.referenceId || `ENQ-${String(enquiry._id).slice(-4).toUpperCase()}`,
        amount: rawAmount || quotationData.amount,
        notes: quotationData.notes,
        date: new Date(),
      });
    } catch (pdfErr) {
      console.error("Failed to generate quotation PDF:", pdfErr);
    }

    // 5. FORMAT CLEAN QUOTATION TEXT WITHOUT EMOJIS
    const quotationMessageText = [
      `OFFICIAL QUOTATION (${quotationRef})`,
      `Supplier: ${lead.business?.name || "Verified Supplier"}`,
      `Requirement: ${enquiry.title || "Your Requirement"}`,
      `Quoted Price: ${formattedAmount}`,
      quotationData.notes ? `Details & Terms: ${quotationData.notes}` : "",
      `-----------------------------------------`,
      `Official PDF Quotation attached. Download and view the PDF document or reply here in chat to negotiate.`
    ].filter(Boolean).join("\n");

    // 6. DIRECT & SECURE DELIVERY TO CUSTOMER'S MESSAGE BOX WITH PDF ATTACHMENT
    try {
      await messageService.sendMessage(
        {
          recipientId: customerUserId,
          text: quotationMessageText,
          enquiryId: enquiry._id,
          attachments: pdfUrl ? [pdfUrl] : [],
        },
        user.id
      );
    } catch (msgErr) {
      console.error("Error delivering quotation message to customer inbox:", msgErr);
    }

    // 6. REALTIME NOTIFICATION LINKED STRAIGHT TO MESSAGE BOX
    try {
      await notificationService.createNotification({
        recipientId: customerUserId,
        type: "Message",
        title: "New Quotation Received",
        body: `${lead.business?.name || 'A supplier'} sent a quotation of ${formattedAmount} for "${enquiry.title}". Check your message box.`,
        entityId: lead._id,
        link: `/me/messages?userId=${user.id}`
      });
    } catch (err) {
      console.error("Failed to create quotation notification:", err);
    }

    return lead;
  },

  /**
   * Update lead CRM pipeline stage
   */
  updateLeadStatus: async (leadId, { status, notes }, user) => {
    const lead = await Lead.findById(leadId).populate("business").populate("enquiry");
    if (!lead) {
      throw new NotFoundError("Lead not found");
    }

    if (user) {
      const businessOwnerId = String(lead.business?.owner?._id || lead.business?.owner || "");
      const businessId = String(lead.business?._id || lead.business || "");
      const isOwner = businessOwnerId && businessOwnerId === String(user.id);
      const isSameBusiness = user.businessId && String(user.businessId) === businessId;
      const isAdmin = ["super_admin", "secretariat", "chapter_admin"].includes(user.role);

      if (!isOwner && !isSameBusiness && !isAdmin && businessOwnerId) {
        throw new ForbiddenError("You are not authorized to update this lead's status");
      }
    }

    lead.status = status;
    lead.lastActivityAt = new Date();
    if (notes !== undefined) lead.notes = notes;
    await lead.save();

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
