import { paymentService } from "./payment.service.js";
import { asyncHandler } from "../../shared/utils/async-handler.js";
import { ApiResponse } from "../../shared/utils/response.js";

export const paymentController = {
  createOrder: asyncHandler(async (req, res) => {
    const order = await paymentService.createRazorpayOrder(req.body, req.user);
    return ApiResponse.success(res, order, "Razorpay order created successfully");
  }),

  verifyPayment: asyncHandler(async (req, res) => {
    const result = await paymentService.verifyRazorpayPayment(req.body, req.user);
    return ApiResponse.success(res, result, "Payment verified and processed successfully");
  }),

  createPayment: asyncHandler(async (req, res) => {
    const payment = await paymentService.createPayment(req.body, req.user);
    return ApiResponse.created(res, payment, "Payment processed successfully");
  }),

  getMyPayments: asyncHandler(async (req, res) => {
    const { payments, summary, meta } = await paymentService.listUserPayments(req.user.id, req.query);
    return ApiResponse.success(res, { payments, summary }, "My transactions retrieved", 200, meta);
  }),

  getInvoice: asyncHandler(async (req, res) => {
    const { identifier } = req.params;
    const invoice = await paymentService.getInvoice(identifier, req.user);
    return ApiResponse.success(res, invoice, "Invoice retrieved");
  }),

  listAllPayments: asyncHandler(async (req, res) => {
    const { payments, meta } = await paymentService.listAllPayments(req.query, req.user);
    return ApiResponse.success(res, payments, "All transactions retrieved", 200, meta);
  }),

  processRefund: asyncHandler(async (req, res) => {
    const { id } = req.params;
    const payment = await paymentService.updatePaymentStatus(id, "Refunded", req.user.id);
    return ApiResponse.success(res, payment, "Payment marked as refunded successfully");
  }),

  verifyPaymentByAdmin: asyncHandler(async (req, res) => {
    const { id } = req.params;
    const payment = await paymentService.verifyPaymentByAdmin(id, req.user.id);
    return ApiResponse.success(res, payment, "Payment verified and approved successfully");
  }),
};
