import mongoose from "mongoose";
import { ThankYouNote } from "./thank-you-note.model.js";
import { resolveOwnBusiness, resolveMemberBusiness } from "./networking.utils.js";
import { parsePagination, buildPaginationMeta } from "../../shared/utils/pagination.js";
import { ROLES } from "../../shared/constants/roles.js";
import { BadRequestError, ForbiddenError, NotFoundError } from "../../shared/errors/errors.js";

const POPULATE_FIELDS = [
  ["giverBusiness", "name logo city slug"],
  ["receiverBusiness", "name logo city slug"],
  ["giverUser", "name email phone"],
  ["receiverUser", "name email phone"],
];

const withPopulate = (query) =>
  POPULATE_FIELDS.reduce((q, [path, select]) => q.populate(path, select), query);

const buildScopeFilter = (user) => {
  if (!user) return { _id: null };
  if (user.role === ROLES.CENTRAL_ADMIN) return {};
  if (user.role === ROLES.STATE_ADMIN) {
    if (!user.state) return { _id: null };
    const re = new RegExp(`^${user.state.trim()}$`, "i");
    return { $or: [{ giverState: re }, { receiverState: re }] };
  }
  if (user.role === ROLES.CHAPTER_ADMIN) {
    if (!user.chapterId) return { _id: null };
    return { $or: [{ giverChapterId: user.chapterId }, { receiverChapterId: user.chapterId }] };
  }
  return { _id: null };
};

export const thankYouNoteService = {
  /**
   * The person submitting this record is thanking a fellow member for the
   * business that member gave them — so the submitter is the RECEIVER of the
   * business, and the selected counterpart (who is being thanked) is the GIVER.
   */
  create: async (userId, data) => {
    const { counterpartBusinessId, amount, note, referralId } = data;

    if (!counterpartBusinessId) {
      throw new BadRequestError("Please select the member you're thanking.");
    }
    const numericAmount = Number(amount);
    if (!numericAmount || numericAmount <= 0) {
      throw new BadRequestError("Please enter a valid amount greater than zero.");
    }

    const receiverBusiness = await resolveOwnBusiness(userId);

    if (String(receiverBusiness._id) === String(counterpartBusinessId)) {
      throw new BadRequestError("You cannot record business generated to yourself.");
    }

    const giverBusiness = await resolveMemberBusiness(counterpartBusinessId);

    const record = await ThankYouNote.create({
      giverUser: giverBusiness.owner,
      giverBusiness: giverBusiness._id,
      giverChapterId: giverBusiness.chapterId,
      giverState: giverBusiness.state,

      receiverUser: userId,
      receiverBusiness: receiverBusiness._id,
      receiverChapterId: receiverBusiness.chapterId,
      receiverState: receiverBusiness.state,

      amount: numericAmount,
      note: (note || "").trim(),
      source: referralId ? "referral" : "direct",
      referral: referralId || null,
    });

    return withPopulate(ThankYouNote.findById(record._id));
  },

  listMine: async (userId, queryParams = {}) => {
    const { page, limit, skip, sort } = parsePagination(queryParams);
    const filter = { $or: [{ giverUser: userId }, { receiverUser: userId }] };

    const [records, total] = await Promise.all([
      withPopulate(ThankYouNote.find(filter).sort(sort).skip(skip).limit(limit)),
      ThankYouNote.countDocuments(filter),
    ]);

    return { records, meta: buildPaginationMeta(total, page, limit) };
  },

  listForAdmin: async (user, queryParams = {}) => {
    const { page, limit, skip, sort } = parsePagination(queryParams);
    const filter = buildScopeFilter(user);

    const [records, total] = await Promise.all([
      withPopulate(ThankYouNote.find(filter).sort(sort).skip(skip).limit(limit)),
      ThankYouNote.countDocuments(filter),
    ]);

    return { records, meta: buildPaginationMeta(total, page, limit) };
  },

  summaryForUser: async (userId) => {
    const objectId = new mongoose.Types.ObjectId(String(userId));
    const [givenAgg, receivedAgg] = await Promise.all([
      ThankYouNote.aggregate([
        { $match: { giverUser: objectId } },
        { $group: { _id: null, total: { $sum: "$amount" }, count: { $sum: 1 } } },
      ]),
      ThankYouNote.aggregate([
        { $match: { receiverUser: objectId } },
        { $group: { _id: null, total: { $sum: "$amount" }, count: { $sum: 1 } } },
      ]),
    ]);

    return {
      totalGiven: givenAgg[0]?.total || 0,
      givenCount: givenAgg[0]?.count || 0,
      totalReceived: receivedAgg[0]?.total || 0,
      receivedCount: receivedAgg[0]?.count || 0,
    };
  },

  getById: async (id, user) => {
    const record = await withPopulate(ThankYouNote.findById(id));
    if (!record) throw new NotFoundError("Thank you note not found");

    const partyIds = [
      String(record.giverUser?._id || record.giverUser),
      String(record.receiverUser?._id || record.receiverUser),
    ];
    if (partyIds.includes(String(user.id))) return record;

    if (user.role === ROLES.CENTRAL_ADMIN) return record;

    if (user.role === ROLES.STATE_ADMIN && user.state) {
      const re = new RegExp(`^${user.state.trim()}$`, "i");
      if (re.test(record.giverState) || re.test(record.receiverState)) return record;
    }

    if (user.role === ROLES.CHAPTER_ADMIN && user.chapterId) {
      const giverChapterId = String(record.giverChapterId?._id || record.giverChapterId);
      const receiverChapterId = String(record.receiverChapterId?._id || record.receiverChapterId);
      if (giverChapterId === String(user.chapterId) || receiverChapterId === String(user.chapterId)) {
        return record;
      }
    }

    throw new ForbiddenError("You do not have access to this record");
  },
};
