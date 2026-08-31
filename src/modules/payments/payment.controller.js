import { paymentService } from "./payment.service.js";
import { asyncHandler } from "../../shared/utils/async-handler.js";
import { ApiResponse } from "../../shared/utils/response.js";

export const paymentController = {
  createPayment: asyncHandler(async (req, res) => {
    const payment = await paymentService.createPayment(req.body, req.user);
    return ApiResponse.created(res, payment, "Payment processed successfully");
  }),

  getMyPayments: asyncHandler(async (req, res) => {
    const { payments, meta } = await paymentService.listUserPayments(req.user.id, req.query);
    return ApiResponse.success(res, payments, "My transactions retrieved", 200, meta);
  }),

  getInvoice: asyncHandler(async (req, res) => {
    const { identifier } = req.params;
    const invoice = await paymentService.getInvoice(identifier);
    return ApiResponse.success(res, invoice, "Invoice retrieved");
  }),

  listAllPayments: asyncHandler(async (req, res) => {
    const { payments, meta } = await paymentService.listAllPayments(req.query);
    return ApiResponse.success(res, payments, "All transactions retrieved", 200, meta);
  }),
};
