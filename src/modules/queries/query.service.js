import { Query } from "./query.model.js";
import { parsePagination, buildPaginationMeta } from "../../shared/utils/pagination.js";
import { getChapterFilter } from "../../shared/utils/chapter-scope.js";
import { NotFoundError } from "../../shared/errors/errors.js";

export const queryService = {
  create: async (data) => {
    const query = new Query(data);
    await query.save();
    return query;
  },

  list: async (queryParams = {}, requester = null) => {
    const { page, limit, skip, sort } = parsePagination(queryParams);
    const filter = {};

    // Apply chapter scope so Chapter Admins only see their queries
    if (requester) {
      const chapterScope = await getChapterFilter(requester);
      if (chapterScope.chapter) {
        filter.chapter = chapterScope.chapter;
      }
    }

    if (queryParams.status) {
      filter.status = queryParams.status;
    }

    if (queryParams.search) {
      filter.$or = [
        { fullName: { $regex: queryParams.search, $options: "i" } },
        { email: { $regex: queryParams.search, $options: "i" } },
        { organization: { $regex: queryParams.search, $options: "i" } },
      ];
    }

    const [queries, total] = await Promise.all([
      Query.find(filter).sort(sort).skip(skip).limit(limit).populate("repliedBy", "name email"),
      Query.countDocuments(filter),
    ]);

    return {
      queries,
      meta: buildPaginationMeta(total, page, limit),
    };
  },

  reply: async (queryId, replyMessage, requester) => {
    const chapterScope = requester ? await getChapterFilter(requester) : {};
    const filter = { _id: queryId };
    if (chapterScope.chapter) {
      filter.chapter = chapterScope.chapter;
    }

    const query = await Query.findOne(filter);
    if (!query) {
      throw new NotFoundError("Query not found or you don't have access to it.");
    }

    query.replyMessage = replyMessage;
    query.status = "Replied";
    query.repliedAt = new Date();
    if (requester) {
      query.repliedBy = requester._id;
    }

    await query.save();

    // Send email to user (optional but nice)
    try {
      const { emailService } = await import("../../infrastructure/email/email.service.js");
      await emailService.sendEmail({
        to: query.email,
        subject: `RE: Your Query to RIFAH (${query.desk})`,
        text: `Dear ${query.fullName},\n\nThank you for reaching out to RIFAH.\n\nReply from ${query.chapter}:\n${replyMessage}\n\nBest Regards,\nRIFAH Chamber of Commerce & Industry`,
      });
    } catch (e) {
      console.error("Failed to send reply email for query", e);
    }

    return query;
  },
};
