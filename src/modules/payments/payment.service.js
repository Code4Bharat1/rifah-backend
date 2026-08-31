import { Payment } from "./payment.model.js";
import { generateReferenceId } from "../../shared/utils/generate-id.js";
import { parsePagination, buildPaginationMeta } from "../../shared/utils/pagination.js";
import { NotFoundError } from "../../shared/errors/errors.js";

export const paymentService = {
  /**
   * Process / Record a payment transaction
   */
  createPayment: async (data, user) => {
    let invoiceNumber = generateReferenceId("INV", 4);
    while (await Payment.findOne({ invoiceNumber })) {
      invoiceNumber = generateReferenceId("INV", 4);
    }

    return Payment.create({
      ...data,
      invoiceNumber,
      payer: user.id,
      transactionId: `TXN-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`,
      status: "Paid",
      paidAt: new Date(),
    });
  },

  /**
   * List payments for a user or business
   */
  listUserPayments: async (userId, queryParams = {}) => {
    const { page, limit, skip, sort } = parsePagination(queryParams);
    const filter = { payer: userId };

    const [payments, total] = await Promise.all([
      Payment.find(filter).sort(sort).skip(skip).limit(limit),
      Payment.countDocuments(filter),
    ]);

    return {
      payments,
      meta: buildPaginationMeta(total, page, limit),
    };
  },

  /**
   * List all transactions (Admin Secretariat console)
   */
  listAllPayments: async (queryParams = {}) => {
    const { page, limit, skip, sort } = parsePagination(queryParams);
    const filter = {};

    if (queryParams.status) filter.status = queryParams.status;
    if (queryParams.itemType) filter.itemType = queryParams.itemType;

    const [payments, total] = await Promise.all([
      Payment.find(filter)
        .populate("payer", "name email phone")
        .populate("business", "name slug chapter")
        .sort(sort)
        .skip(skip)
        .limit(limit),
      Payment.countDocuments(filter),
    ]);

    return {
      payments,
      meta: buildPaginationMeta(total, page, limit),
    };
  },

  /**
   * Get invoice details
   */
  getInvoice: async (identifier) => {
    const isObjectId = identifier.match(/^[0-9a-fA-F]{24}$/);
    const query = isObjectId ? { _id: identifier } : { invoiceNumber: identifier };

    const payment = await Payment.findOne(query)
      .populate("payer", "name email phone")
      .populate("business", "name slug chapter city");

    if (!payment) {
      throw new NotFoundError("Invoice not found");
    }
    return payment;
  },
};
