import { Enquiry } from "./enquiry.model.js";
import { Business } from "../businesses/business.model.js";
import { User } from "../users/user.model.js";
import { notificationService } from "../notifications/notification.service.js";
import { emailService } from "../../infrastructure/email/email.service.js";
import { generateReferenceId } from "../../shared/utils/generate-id.js";
import { parsePagination, buildPaginationMeta } from "../../shared/utils/pagination.js";
import { NotFoundError, ForbiddenError } from "../../shared/errors/errors.js";
import { ROLES } from "../../shared/constants/roles.js";
import { getChapterFilter } from "../../shared/utils/chapter-scope.js";

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

    const targetType = data.targetType || (data.targetBusiness ? "business" : (data.chapter && data.chapter !== "All Chapters" ? "chamber" : "all"));

    let userBusiness = null;
    if (user) {
      userBusiness = await Business.findOne({ owner: user.id });
    }

    let requesterRole = "Guest Customer";
    let requesterName = data.name || "Customer";
    if (user) {
      if (user.role === "business" || userBusiness) {
        requesterRole = "Business Member";
        requesterName = userBusiness?.name || user.name || "Business Member";
      } else if (user.role === "customer") {
        requesterRole = "Verified Customer";
        requesterName = (user.name && !user.name.toLowerCase().includes("buyer account")) ? user.name : "Customer";
      } else {
        requesterRole = "Registered Customer";
        requesterName = user.name || "Customer";
      }
    }

    const resolvedChapter = targetType === "chamber" && data.chapter
      ? data.chapter
      : (targetType === "all" ? (data.chapter || "All Chapters") : (data.chapter || user?.chapter || "Mumbai Chapter"));

    const enquiry = await Enquiry.create({
      ...data,
      referenceId,
      targetType,
      requester: user ? user.id : null,
      requesterName,
      requesterRole,
      timeline: initialTimeline,
      chapter: resolvedChapter,
    });

    if (targetType === "business" && data.targetBusiness) {
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
              location: enquiry.location || enquiry.city,
              buyerName: enquiry.requesterName,
            });
          }

          const { leadService } = await import("../leads/lead.service.js");
          leadService.routeEnquiryToBusinesses(enquiry._id.toString(), [data.targetBusiness.toString()]).catch(err => {
            console.error("Direct lead routing background task failed:", err);
          });
        }
      } catch (err) {}
    } else if (targetType === "chamber" && data.chapter) {
      try {
        const query = {
          chapter: data.chapter,
          status: { $in: ["Live", "Active"] },
          ...(userBusiness ? { _id: { $ne: userBusiness._id } } : {}),
        };
        const matchingBusinesses = await Business.find(query);

        if (matchingBusinesses.length > 0) {
          const businessIds = matchingBusinesses.map(b => b._id.toString());
          const { leadService } = await import("../leads/lead.service.js");
          leadService.routeEnquiryToBusinesses(enquiry._id.toString(), businessIds).catch(err => {
            console.error("Chapter routing background task failed:", err);
          });
        }
      } catch (err) {
        console.error("Failed to route by chapter:", err);
      }
    } else if (targetType === "all") {
      try {
        const query = {
          status: { $in: ["Live", "Active"] },
          ...(userBusiness ? { _id: { $ne: userBusiness._id } } : {}),
        };
        const matchingBusinesses = await Business.find(query);

        if (matchingBusinesses.length > 0) {
          const businessIds = matchingBusinesses.map(b => b._id.toString());
          const { leadService } = await import("../leads/lead.service.js");
          leadService.routeEnquiryToBusinesses(enquiry._id.toString(), businessIds).catch(err => {
            console.error("Broadcast routing to all businesses background task failed:", err);
          });
        }
      } catch (err) {
        console.error("Failed to route to all businesses:", err);
      }
    }

    return enquiry;
  },

  /**
   * Get single enquiry by ID or Reference ID
   */
  getEnquiryById: async (identifier, user) => {
    const isObjectId = identifier.match(/^[0-9a-fA-F]{24}$/);
    const query = isObjectId ? { _id: identifier } : { referenceId: identifier };

    const enquiry = await Enquiry.findOne(query)
      .populate("requester", "name email phone")
      .populate("targetBusiness", "name slug chapter city phone owner");

    if (!enquiry) {
      throw new NotFoundError("Enquiry not found");
    }

    if (user) {
      const isRequester = String(enquiry.requester?._id || enquiry.requester || "") === String(user.id);
      const isTargetOwner = String(enquiry.targetBusiness?.owner || "") === String(user.id);
      const isAdmin = ["super_admin", "secretariat", "chapter_admin"].includes(user.role);

      let hasRoutedLead = false;
      if (!isRequester && !isTargetOwner && !isAdmin) {
        const { Lead } = await import("../leads/lead.model.js");
        const { Business } = await import("../businesses/business.model.js");
        const userBusiness = await Business.findOne({ owner: user.id });
        if (userBusiness) {
          const leadExists = await Lead.exists({ enquiry: enquiry._id, business: userBusiness._id });
          if (leadExists) hasRoutedLead = true;
        }
      }

      if (!isRequester && !isTargetOwner && !isAdmin && !hasRoutedLead) {
        throw new ForbiddenError("You are not authorized to view this enquiry");
      }
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
   * List direct and chamber/pan-chamber enquiries accessible to current business
   */
  listBusinessEnquiries: async (userId, queryParams = {}) => {
    const { page, limit, skip, sort } = parsePagination(queryParams);
    const userBusiness = await Business.findOne({ owner: userId });
    if (!userBusiness) {
      return { enquiries: [], meta: buildPaginationMeta(0, page, limit) };
    }

    const { Lead } = await import("../leads/lead.model.js");

    // Fetch existing leads for this business
    const userLeads = await Lead.find({ business: userBusiness._id });
    const userLeadMap = new Map();
    userLeads.forEach((l) => {
      if (l.enquiry) {
        userLeadMap.set(l.enquiry.toString(), l);
      }
    });
    const routedEnquiryIds = Array.from(userLeadMap.keys());

    // Build filter matching:
    // 1. Direct enquiries to this business
    // 2. Routed leads to this business
    // 3. Pan-chamber broadcasts ("all")
    // 4. Chamber broadcasts matching this business's chapter
    // STRICT RULE: Exclude user's own posted enquiries (which are in My Enquiries)
    const filter = {
      $and: [
        { requester: { $ne: userId } },
        {
          $or: [
            { targetBusiness: userBusiness._id },
            { _id: { $in: routedEnquiryIds } },
            { targetType: "all" },
            { targetType: "chamber", chapter: userBusiness.chapter },
            { targetType: { $exists: false }, targetBusiness: userBusiness._id },
          ],
        },
      ],
    };

    if (queryParams.status && queryParams.status !== "undefined" && queryParams.status !== "null" && queryParams.status.toLowerCase() !== "all") {
      filter.$and.push({ status: new RegExp(`^${queryParams.status}$`, "i") });
    }

    if (queryParams.search) {
      filter.$and.push({
        $or: [
          { title: { $regex: queryParams.search, $options: "i" } },
          { referenceId: { $regex: queryParams.search, $options: "i" } },
          { requesterName: { $regex: queryParams.search, $options: "i" } },
          { category: { $regex: queryParams.search, $options: "i" } },
        ],
      });
    }

    const [enquiries, total] = await Promise.all([
      Enquiry.find(filter)
        .populate("requester", "name email phone avatar")
        .populate("targetBusiness", "name slug chapter")
        .sort(sort || { createdAt: -1 })
        .skip(skip)
        .limit(limit),
      Enquiry.countDocuments(filter),
    ]);

    // Ensure an associated Lead record exists for each visible enquiry,
    // so the business owner can immediately Accept or Submit a Quotation!
    const enrichedEnquiries = await Promise.all(
      enquiries.map(async (enq) => {
        const enqObj = enq.toObject ? enq.toObject() : { ...enq };
        let lead = userLeadMap.get(enq._id.toString());
        if (!lead) {
          try {
            lead = await Lead.create({
              enquiry: enq._id,
              business: userBusiness._id,
              status: "New",
            });
            userLeadMap.set(enq._id.toString(), lead);
          } catch (createErr) {
            lead = await Lead.findOne({ enquiry: enq._id, business: userBusiness._id });
          }
        }
        const hasValidQuotation = Boolean(lead?.quotation?.amount && Number(lead.quotation.amount) > 0);
        enqObj.leadId = lead?._id ? lead._id.toString() : null;
        enqObj.leadStatus = hasValidQuotation ? (lead?.status || "Responded") : (lead?.status === "Responded" ? "New" : (lead?.status || "New"));
        enqObj.myQuotation = hasValidQuotation ? lead.quotation : null;
        return enqObj;
      })
    );

    return {
      enquiries: enrichedEnquiries,
      meta: buildPaginationMeta(total, page, limit),
    };
  },

  /**
   * List all enquiries chamber-wide (Admin)
   */
  listAllEnquiries: async (queryParams = {}, requester = null) => {
    const { page, limit, skip, sort } = parsePagination(queryParams);
    const filter = {};
    const conditions = [];

    // RBAC: Chapter Admin Scope Enforcement
    if (requester && requester.role === ROLES.CHAPTER_ADMIN) {
      if (!requester.chapter) {
        conditions.push({ _id: null }); // Deny access
      } else {
        const baseCity = requester.chapter.replace(/\b(chapter|chamber)\b/gi, '').trim();
        const chapterRegex = new RegExp(baseCity, "i");
        
        const businesses = await Business.find({ chapter: chapterRegex }).select("_id");
        const businessIds = businesses.map((b) => b._id);
        
        conditions.push({
          $or: [
            { chapter: chapterRegex },
            { targetType: "all" },
            { targetBusiness: { $in: businessIds } }
          ]
        });
      }
    }

    if (queryParams.status && queryParams.status.toLowerCase() !== "all") {
      conditions.push({ status: queryParams.status });
    }
    if (queryParams.category) {
      conditions.push({ category: queryParams.category });
    }
    
    // Type Filter (Direct RFQs vs Broadcast RFQs)
    if (queryParams.type && queryParams.type.toLowerCase() !== "all") {
      if (queryParams.type === "direct") {
        conditions.push({ targetBusiness: { $exists: true, $ne: null } });
      } else if (queryParams.type === "broadcast") {
        conditions.push({ targetBusiness: { $exists: false } });
      }
    }

    // Chapter Filter
    if (queryParams.chapter && queryParams.chapter.toLowerCase() !== "all") {
      // If Chapter Admin, they can only search their own chapter which is enforced by RBAC
      if (!requester || requester.role !== ROLES.CHAPTER_ADMIN) {
        conditions.push({ chapter: queryParams.chapter });
      }
    }

    if (queryParams.search) {
      conditions.push({
        $or: [
          { title: { $regex: queryParams.search, $options: "i" } },
          { referenceId: { $regex: queryParams.search, $options: "i" } },
          { requesterName: { $regex: queryParams.search, $options: "i" } },
        ]
      });
    }

    if (conditions.length > 0) {
      filter.$and = conditions;
    }

    const [enquiries, total] = await Promise.all([
      Enquiry.find(filter)
        .populate("requester", "name email phone")
        .populate("targetBusiness", "name slug chapter")
        .populate("assignedTo", "name email role")
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
   * Update enquiry status, assignment & timeline
   */
  updateEnquiryStatus: async (id, { status, assignedTo, resolutionNote, timelineUpdate }, requester) => {
    const chapterScope = await getChapterFilter(requester, 'direct');
    const enquiry = await Enquiry.findOne({ _id: id, ...chapterScope });
    if (!enquiry) {
      throw new NotFoundError("Enquiry not found or access denied");
    }

    const oldStatus = enquiry.status;
    if (status) enquiry.status = status;
    if (assignedTo !== undefined) enquiry.assignedTo = assignedTo;
    if (resolutionNote !== undefined) enquiry.resolutionNote = resolutionNote;
    
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
    const filter = {};
    const conditions = [];

    // RBAC: Chapter Admin Scope Enforcement
    if (requester && requester.role === ROLES.CHAPTER_ADMIN) {
      if (!requester.chapter) {
        conditions.push({ _id: null }); // Deny access
      } else {
        const baseCity = requester.chapter.replace(/\b(chapter|chamber)\b/gi, '').trim();
        const chapterRegex = new RegExp(baseCity, "i");
        
        const businesses = await Business.find({ chapter: chapterRegex }).select("_id");
        const businessIds = businesses.map((b) => b._id);
        
        conditions.push({
          $or: [
            { chapter: chapterRegex },
            { targetType: "all" },
            { targetBusiness: { $in: businessIds } }
          ]
        });
      }
    }

    if (queryParams.status && queryParams.status.toLowerCase() !== "all") {
      conditions.push({ status: queryParams.status });
    }
    if (queryParams.category) {
      conditions.push({ category: queryParams.category });
    }
    
    // Type Filter (Direct RFQs vs Broadcast RFQs)
    if (queryParams.type && queryParams.type.toLowerCase() !== "all") {
      if (queryParams.type === "direct") {
        conditions.push({ targetBusiness: { $exists: true, $ne: null } });
      } else if (queryParams.type === "broadcast") {
        conditions.push({ targetBusiness: { $exists: false } });
      }
    }

    // Chapter Filter
    if (queryParams.chapter && queryParams.chapter.toLowerCase() !== "all") {
      if (!requester || requester.role !== ROLES.CHAPTER_ADMIN) {
        conditions.push({ chapter: queryParams.chapter });
      }
    }

    if (queryParams.search) {
      conditions.push({
        $or: [
          { title: { $regex: queryParams.search, $options: "i" } },
          { referenceId: { $regex: queryParams.search, $options: "i" } },
          { requesterName: { $regex: queryParams.search, $options: "i" } },
        ]
      });
    }

    if (conditions.length > 0) {
      filter.$and = conditions;
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
