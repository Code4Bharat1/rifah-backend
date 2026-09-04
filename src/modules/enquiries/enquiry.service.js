import { Enquiry } from "./enquiry.model.js";
import { Business } from "../businesses/business.model.js";
import { User } from "../users/user.model.js";
import { notificationService } from "../notifications/notification.service.js";
import { emailService } from "../../infrastructure/email/email.service.js";
import { generateReferenceId } from "../../shared/utils/generate-id.js";
import { parsePagination, buildPaginationMeta } from "../../shared/utils/pagination.js";
import { NotFoundError, ForbiddenError } from "../../shared/errors/errors.js";
import { ROLES } from "../../shared/constants/roles.js";

export const enquiryService = {
  /**
   * Create a new Buyer enquiry / RFQ
   */
  createEnquiry: async (data, user) => {
    let referenceId = generateReferenceId("ENQ", 4);
    while (await Enquiry.findOne({ referenceId })) {
      referenceId = generateReferenceId("ENQ", 4);
    }

    const initialTimeline = [
      { label: "Enquiry submitted", at: "Just now", done: true },
      { label: "Routing to matching businesses", at: "Pending", done: false },
      { label: "Business responses", at: "Pending", done: false },
      { label: "Enquiry closed", at: "Pending", done: false },
    ];

    const enquiry = await Enquiry.create({
      ...data,
      referenceId,
      requester: user ? user.id : null,
      requesterName: user ? (user.name || "Buyer Account") : (data.name || "Guest Buyer"),
      requesterRole: user ? (user.role === "customer" ? "Customer / Buyer" : "Member Buyer") : "Guest User",
      timeline: initialTimeline,
    });

    if (data.targetBusiness) {
      try {
        const targetBiz = await Business.findById(data.targetBusiness);
        if (targetBiz?.owner) {
          await notificationService.createNotification({
            recipientId: targetBiz.owner,
            type: "Enquiry",
            title: "New Direct Enquiry",
            body: `New requirement "${enquiry.title}" received from ${enquiry.requesterName}.`,
            entityId: enquiry._id,
            link: "/biz/enquiries",
          });

          let targetEmail = null;
          let ownerName = targetBiz.name;

          if (targetBiz.owner) {
            const ownerUser = await User.findById(targetBiz.owner);
            if (ownerUser?.email) {
              targetEmail = ownerUser.email;
              ownerName = ownerUser.name;
            }
          }

          if (!targetEmail && targetBiz.email) {
            targetEmail = targetBiz.email;
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
    } else {
      // Auto-routing if enabled
      try {
        const { Settings } = await import("../settings/settings.model.js");
        const settings = await Settings.findOne({ isSingleton: "global" });
        if (settings && settings.autoRouteLeadsByCategory) {
          const matchingBusinesses = await Business.find({
            $or: [
              { category: new RegExp(`^${data.category}$`, "i") },
              { industry: new RegExp(`^${data.category}$`, "i") }
            ],
            status: { $in: ["Live", "Active"] } // Only route to active businesses
          });

          if (matchingBusinesses.length > 0) {
            const businessIds = matchingBusinesses.map(b => b._id.toString());
            const { leadService } = await import("../leads/lead.service.js");
            // Perform routing in background without waiting
            leadService.routeEnquiryToBusinesses(enquiry._id.toString(), businessIds).catch(err => {
               console.error("Auto-routing background task failed:", err);
            });
          }
        }
      } catch (err) {
        console.error("Failed to check auto-routing:", err);
      }
    }

    return enquiry;
  },

  /**
   * Get single enquiry by ID or Reference ID
   */
  getEnquiryById: async (identifier) => {
    const isObjectId = identifier.match(/^[0-9a-fA-F]{24}$/);
    const query = isObjectId ? { _id: identifier } : { referenceId: identifier };

    const enquiry = await Enquiry.findOne(query)
      .populate("requester", "name email phone")
      .populate("targetBusiness", "name slug chapter city phone");

    if (!enquiry) {
      throw new NotFoundError("Enquiry not found");
    }
    return enquiry;
  },

  /**
   * List enquiries submitted by current buyer
   */
  listBuyerEnquiries: async (userId, queryParams = {}) => {
    const { page, limit, skip, sort } = parsePagination(queryParams);
    const filter = { requester: userId };

    if (queryParams.status && queryParams.status !== "undefined" && queryParams.status !== "null" && queryParams.status.toLowerCase() !== "all") {
      if (queryParams.status.toLowerCase() === "submitted" || queryParams.status.toLowerCase() === "new") {
        filter.status = { $in: ["New", "Submitted"] };
      } else {
        filter.status = new RegExp(`^${queryParams.status}$`, "i");
      }
    }

    const [enquiries, total] = await Promise.all([
      Enquiry.find(filter)
        .populate("targetBusiness", "name slug chapter")
        .sort(sort)
        .skip(skip)
        .limit(limit),
      Enquiry.countDocuments(filter),
    ]);

    return {
      enquiries,
      meta: buildPaginationMeta(total, page, limit),
    };
  },

  /**
   * List all enquiries chamber-wide (Admin)
   */
  listAllEnquiries: async (queryParams = {}, requester = null) => {
    const { page, limit, skip, sort } = parsePagination(queryParams);
    const filter = {};

    // RBAC: Chapter Admin Scope Enforcement
    if (requester && requester.role === ROLES.CHAPTER_ADMIN) {
      const chapterBusinesses = await Business.find({ chapter: requester.chapter }).select('_id');
      const businessIds = chapterBusinesses.map(b => b._id);
      filter.targetBusiness = { $in: businessIds };
    }

    if (queryParams.status && queryParams.status.toLowerCase() !== "all") filter.status = queryParams.status;
    if (queryParams.category) filter.category = queryParams.category;
    
    // Type Filter (Direct RFQs vs Broadcast RFQs)
    if (queryParams.type && queryParams.type.toLowerCase() !== "all") {
      if (queryParams.type === "direct") {
        filter.targetBusiness = { $exists: true, $ne: null };
      } else if (queryParams.type === "broadcast") {
        filter.targetBusiness = { $exists: false };
      }
    }

    // Chapter Filter
    if (queryParams.chapter && queryParams.chapter.toLowerCase() !== "all") {
      const chapterBusinesses = await Business.find({ chapter: queryParams.chapter }).select('_id');
      const businessIds = chapterBusinesses.map(b => b._id);
      
      if (filter.targetBusiness && filter.targetBusiness.$in) {
        const adminBusinessIds = filter.targetBusiness.$in.map(id => id.toString());
        const validIds = businessIds.filter(id => adminBusinessIds.includes(id.toString()));
        filter.targetBusiness = { $in: validIds };
      } else {
        filter.targetBusiness = { $in: businessIds };
      }
    }

    if (queryParams.search) {
      filter.$or = [
        { title: { $regex: queryParams.search, $options: "i" } },
        { referenceId: { $regex: queryParams.search, $options: "i" } },
        { requesterName: { $regex: queryParams.search, $options: "i" } },
      ];
    }

    const [enquiries, total] = await Promise.all([
      Enquiry.find(filter)
        .populate("requester", "name email phone")
        .populate("targetBusiness", "name slug chapter")
        .sort(sort)
        .skip(skip)
        .limit(limit),
      Enquiry.countDocuments(filter),
    ]);

    return {
      enquiries,
      meta: buildPaginationMeta(total, page, limit),
    };
  },

  /**
   * Update enquiry status & timeline
   */
  updateEnquiryStatus: async (id, { status, timelineUpdate }) => {
    const enquiry = await Enquiry.findById(id);
    if (!enquiry) {
      throw new NotFoundError("Enquiry not found");
    }

    const oldStatus = enquiry.status;
    enquiry.status = status;
    if (timelineUpdate) {
      enquiry.timeline.push(timelineUpdate);
    }
    await enquiry.save();

    // Notify customer on status change
    if (oldStatus !== status && enquiry.requester) {
      try {
        let title, body;
        if (status === "Routed") {
          title = "Enquiry Approved";
          body = `Your requirement "${enquiry.title}" has been approved and routed to matching businesses.`;
        } else if (status === "Closed" || status === "Rejected") {
          title = `Enquiry ${status}`;
          body = `Your requirement "${enquiry.title}" has been ${status.toLowerCase()}.`;
        }

        if (title && body) {
          await notificationService.createNotification({
            recipientId: enquiry.requester,
            type: "Enquiry",
            title,
            body,
            entityId: enquiry._id,
            link: "/me/enquiries"
          });
        }
      } catch (err) {
        console.error("Failed to notify customer on enquiry status change:", err);
      }
    }

    return enquiry;
  },

  /**
   * Export Enquiries to CSV
   */
  exportCsv: async (queryParams = {}, requester = null) => {
    // Reuse the exact same filter logic as listAllEnquiries
    const filter = {};
    if (requester && requester.role === ROLES.CHAPTER_ADMIN) {
      const chapterBusinesses = await Business.find({ chapter: requester.chapter }).select('_id');
      const businessIds = chapterBusinesses.map(b => b._id);
      filter.targetBusiness = { $in: businessIds };
    }

    if (queryParams.status && queryParams.status.toLowerCase() !== "all") filter.status = queryParams.status;
    if (queryParams.category) filter.category = queryParams.category;
    
    // Type Filter (Direct RFQs vs Broadcast RFQs)
    if (queryParams.type && queryParams.type.toLowerCase() !== "all") {
      if (queryParams.type === "direct") {
        filter.targetBusiness = { $exists: true, $ne: null };
      } else if (queryParams.type === "broadcast") {
        filter.targetBusiness = { $exists: false };
      }
    }

    // Chapter Filter
    if (queryParams.chapter && queryParams.chapter.toLowerCase() !== "all") {
      const chapterBusinesses = await Business.find({ chapter: queryParams.chapter }).select('_id');
      const businessIds = chapterBusinesses.map(b => b._id);
      
      if (filter.targetBusiness && filter.targetBusiness.$in) {
        const adminBusinessIds = filter.targetBusiness.$in.map(id => id.toString());
        const validIds = businessIds.filter(id => adminBusinessIds.includes(id.toString()));
        filter.targetBusiness = { $in: validIds };
      } else {
        filter.targetBusiness = { $in: businessIds };
      }
    }

    if (queryParams.search) {
      filter.$or = [
        { title: { $regex: queryParams.search, $options: "i" } },
        { referenceId: { $regex: queryParams.search, $options: "i" } },
        { requesterName: { $regex: queryParams.search, $options: "i" } },
      ];
    }

    const enquiries = await Enquiry.find(filter)
      .populate("targetBusiness", "name")
      .sort({ createdAt: -1 });

    // Build CSV string manually
    const headers = [
      "Reference ID",
      "Title",
      "Category",
      "Type",
      "Buyer Name",
      "Target Location",
      "Quantity",
      "Budget",
      "Status",
      "Date Created"
    ];

    const escapeCsv = (str) => {
      if (str === null || str === undefined) return '""';
      const safeStr = String(str).replace(/"/g, '""');
      return `"${safeStr}"`;
    };

    const rows = enquiries.map(e => [
      escapeCsv(e.referenceId),
      escapeCsv(e.title),
      escapeCsv(e.category),
      escapeCsv(e.targetBusiness ? "Direct RFQ" : "Broadcast RFQ"),
      escapeCsv(e.requesterName || e.buyerName || "Registered Buyer"),
      escapeCsv(e.city || e.location),
      escapeCsv(e.quantity),
      escapeCsv(e.budget),
      escapeCsv(e.status),
      escapeCsv(e.createdAt.toISOString().split("T")[0])
    ].join(","));

    return [headers.join(","), ...rows].join("\n");
  },
};
