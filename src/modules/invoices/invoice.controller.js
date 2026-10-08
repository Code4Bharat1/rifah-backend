import { invoiceService } from "./invoice.service.js";
import { asyncHandler } from "../../shared/utils/async-handler.js";
import { ApiResponse } from "../../shared/utils/response.js";

export const invoiceController = {
  /**
   * Public Secure Verification Endpoint
   * GET /api/v1/invoices/verify/:invoiceNumber?token=...
   */
  verifyInvoice: asyncHandler(async (req, res) => {
    const { invoiceNumber } = req.params;
    const { token } = req.query;

    const result = await invoiceService.verifyInvoice(invoiceNumber, token);
    return ApiResponse.success(res, result, result.verified ? "Invoice verified successfully" : "Verification completed");
  }),

  /**
   * Public / Authenticated PDF Download Endpoint
   * GET /api/v1/invoices/download/:invoiceNumber?token=...
   */
  downloadPdf: asyncHandler(async (req, res) => {
    const { invoiceNumber } = req.params;
    const { token } = req.query;

    const { buffer, filename } = await invoiceService.getInvoicePdf(invoiceNumber, token);

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.setHeader("Content-Length", buffer.length);
    return res.end(buffer);
  }),

  /**
   * Admin Revoke Endpoint
   * PATCH /api/v1/invoices/:invoiceNumber/revoke
   */
  revokeInvoice: asyncHandler(async (req, res) => {
    const { invoiceNumber } = req.params;
    const { reason } = req.body;

    const result = await invoiceService.revokeInvoice(invoiceNumber, reason, req.user?._id);
    return ApiResponse.success(res, result, "Invoice revoked successfully");
  }),
};

export default invoiceController;
