import { Enquiry } from "./enquiry.model.js";
import { generateReferenceId } from "../../shared/utils/generate-id.js";
import { parsePagination, buildPaginationMeta } from "../../shared/utils/pagination.js";
import { NotFoundError, ForbiddenError } from "../../shared/errors/errors.js";

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

    return Enquiry.create({
      ...data,
      referenceId,
      requester: user.id,
      requesterName: user.name || "Buyer Account",
      requesterRole: user.role === "customer" ? "Customer / Buyer" : "Member Buyer",
      timeline: initialTimeline,
    });
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

    if (queryParams.status) filter.status = queryParams.status;

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
  listAllEnquiries: async (queryParams = {}) => {
    const { page, limit, skip, sort } = parsePagination(queryParams);
    const filter = {};

    if (queryParams.status) filter.status = queryParams.status;
    if (queryParams.category) filter.category = queryParams.category;
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

    enquiry.status = status;
    if (timelineUpdate) {
      enquiry.timeline.push(timelineUpdate);
    }
    await enquiry.save();

    return enquiry;
  },
};
