import fs from "fs";
import path from "path";
import { storageService } from "../storage/storage.service.js";

/**
 * Escapes characters for PDF literal strings
 */
function escapePdfText(str) {
  if (!str) return "";
  return String(str)
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)")
    .replace(/[^\x20-\x7E]/g, " "); // ascii range
}

export const pdfService = {
  /**
   * Generates a clean, professional B2B quotation PDF
   */
  generateQuotationPdf: async ({
    quotationRef,
    supplierName,
    supplierEmail,
    supplierPhone,
    customerName,
    customerEmail,
    enquiryTitle,
    enquiryRef,
    amount,
    notes,
    date,
  }) => {
    const baseDir = storageService.getBaseUploadDir();
    const attachmentsDir = path.join(baseDir, "attachments");
    if (!fs.existsSync(attachmentsDir)) {
      fs.mkdirSync(attachmentsDir, { recursive: true });
    }

    const cleanRef = (quotationRef || "QTN").replace(/[^a-zA-Z0-9_-]/g, "");
    const filename = `quotation-${cleanRef}-${Date.now()}.pdf`;
    const filePath = path.join(attachmentsDir, filename);

    const dateStr = date
      ? new Date(date).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })
      : new Date().toLocaleDateString("en-IN");
    
    const amountNum = Number(amount);
    const amountStr = !isNaN(amountNum) && amountNum > 0
      ? `INR ${amountNum.toLocaleString("en-IN")}`
      : `INR ${amount}`;

    const streamLines = [
      // Top header band (Dark Blue)
      "0.05 0.22 0.45 rg",
      "0 740 595 102 re",
      "f",

      // Header Title
      "BT",
      "/F2 18 Tf",
      "1 1 1 rg",
      "40 795 Td",
      "(RIFAH CONNECT - OFFICIAL B2B QUOTATION) Tj",
      "ET",

      "BT",
      "/F1 10 Tf",
      "0.85 0.92 1.0 rg",
      "40 775 Td",
      "(Chamber of Commerce & Industry Trade Network) Tj",
      "ET",

      // Quotation Ref & Date
      "BT",
      "/F2 11 Tf",
      "1 1 1 rg",
      "400 795 Td",
      `(${escapePdfText(`Ref: ${quotationRef}`)}) Tj`,
      "ET",

      "BT",
      "/F1 9 Tf",
      "0.85 0.92 1.0 rg",
      "400 775 Td",
      `(${escapePdfText(`Date: ${dateStr}`)}) Tj`,
      "ET",

      // Separator
      "0.85 0.88 0.92 RG",
      "1 w",
      "40 720 m 555 720 l S",

      // Supplier Box (Left)
      "0.96 0.97 0.99 rg",
      "40 600 245 105 re f",
      "0.80 0.85 0.90 RG",
      "40 600 245 105 re S",

      "BT",
      "/F2 11 Tf",
      "0.05 0.22 0.45 rg",
      "55 685 Td",
      "(SUPPLIER / ISSUED BY) Tj",
      "/F2 12 Tf",
      "0 0 0 rg",
      "0 -18 Td",
      `(${escapePdfText(supplierName || "Verified Supplier")}) Tj`,
      "/F1 9 Tf",
      "0.3 0.35 0.4 rg",
      "0 -16 Td",
      `(${escapePdfText(supplierEmail || "RIFAH Verified Member")}) Tj`,
      ...(supplierPhone ? ["0 -14 Td", `(${escapePdfText(`Phone: ${supplierPhone}`)}) Tj`] : []),
      "ET",

      // Customer Box (Right)
      "0.96 0.97 0.99 rg",
      "310 600 245 105 re f",
      "0.80 0.85 0.90 RG",
      "310 600 245 105 re S",

      "BT",
      "/F2 11 Tf",
      "0.05 0.22 0.45 rg",
      "325 685 Td",
      "(CUSTOMER / BUYER) Tj",
      "/F2 12 Tf",
      "0 0 0 rg",
      "0 -18 Td",
      `(${escapePdfText(customerName || "Customer")}) Tj`,
      "/F1 9 Tf",
      "0.3 0.35 0.4 rg",
      "0 -16 Td",
      `(${escapePdfText(customerEmail || "Verified Buyer Account")}) Tj`,
      ...(enquiryRef ? ["0 -14 Td", `(${escapePdfText(`Enquiry: ${enquiryRef}`)}) Tj`] : []),
      "ET",

      // Table Header (Dark Slate)
      "0.10 0.18 0.30 rg",
      "40 545 515 28 re f",

      "BT",
      "/F2 10 Tf",
      "1 1 1 rg",
      "55 554 Td",
      "(REQUIREMENT DETAILS) Tj",
      "360 0 Td",
      "(QUOTED PRICE) Tj",
      "ET",

      // Table Body
      "0.98 0.99 1.0 rg",
      "40 485 515 60 re f",
      "0.85 0.88 0.92 RG",
      "40 485 515 60 re S",

      "BT",
      "/F2 12 Tf",
      "0.05 0.1 0.2 rg",
      "55 522 Td",
      `(${escapePdfText(enquiryTitle || "B2B Requirement")}) Tj`,
      "/F1 9 Tf",
      "0.4 0.45 0.5 rg",
      "0 -16 Td",
      `(${escapePdfText(`Enquiry Ref: ${enquiryRef || "N/A"}`)}) Tj`,
      "/F2 14 Tf",
      "0.05 0.5 0.3 rg",
      "360 16 Td",
      `(${escapePdfText(amountStr)}) Tj`,
      "ET",

      // Total Box
      "0.92 0.96 0.94 rg",
      "330 435 225 35 re f",
      "0.6 0.8 0.7 RG",
      "330 435 225 35 re S",

      "BT",
      "/F2 11 Tf",
      "0.1 0.4 0.2 rg",
      "345 447 Td",
      "(TOTAL AMOUNT: ) Tj",
      "/F2 14 Tf",
      "90 0 Td",
      `(${escapePdfText(amountStr)}) Tj`,
      "ET",

      // Terms & Notes Box
      "BT",
      "/F2 11 Tf",
      "0.1 0.15 0.25 rg",
      "40 405 Td",
      "(DETAILS & COMMERCIAL TERMS) Tj",
      "ET",

      "0.98 0.98 0.99 rg",
      "40 310 515 85 re f",
      "0.88 0.90 0.94 RG",
      "40 310 515 85 re S",

      "BT",
      "/F1 10 Tf",
      "0.2 0.25 0.3 rg",
      "55 370 Td",
      `(${escapePdfText(notes ? `Terms: ${notes}` : "Standard B2B trade terms apply. Discussion available in chat.")}) Tj`,
      "/F1 9 Tf",
      "0.4 0.45 0.5 rg",
      "0 -22 Td",
      "(1. Quotation valid for 15 days from issuance unless otherwise agreed.) Tj",
      "0 -15 Td",
      "(2. Delivery and payment milestones subject to final work order.) Tj",
      "ET",

      // Verification Footer
      "0.88 0.91 0.95 RG",
      "0.5 w",
      "40 100 m 555 100 l S",

      "BT",
      "/F2 9 Tf",
      "0.05 0.3 0.6 rg",
      "40 82 Td",
      "(VERIFIED BY RIFAH CHAMBER OF COMMERCE & INDUSTRY) Tj",
      "/F1 8 Tf",
      "0.45 0.5 0.55 rg",
      "0 -14 Td",
      "(Official computer-generated quotation issued on RIFAH Connect. Validated via cryptographic session.) Tj",
      "0 -12 Td",
      `(${escapePdfText(`Quotation ID: ${quotationRef} | Issued on ${dateStr}`)}) Tj`,
      "ET",
    ];

    const streamContent = streamLines.join("\n");
    const streamLength = Buffer.byteLength(streamContent, "utf8");

    const objects = [];
    objects.push("1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n");
    objects.push("2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n");
    objects.push("3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595.28 841.89] /Resources << /Font << /F1 4 0 R /F2 5 0 R >> >> /Contents 6 0 R >>\nendobj\n");
    objects.push("4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n");
    objects.push("5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>\nendobj\n");
    objects.push(`6 0 obj\n<< /Length ${streamLength} >>\nstream\n${streamContent}\nendstream\nendobj\n`);

    let offset = 0;
    const header = "%PDF-1.4\n";
    offset += Buffer.byteLength(header, "utf8");

    const xrefEntries = ["0000000000 65535 f \n"];
    let body = "";

    for (const obj of objects) {
      xrefEntries.push(String(offset).padStart(10, "0") + " 00000 n \n");
      body += obj;
      offset += Buffer.byteLength(obj, "utf8");
    }

    const startXref = offset;
    const xref = `xref\n0 ${objects.length + 1}\n${xrefEntries.join("")}`;
    const trailer = `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${startXref}\n%%EOF\n`;

    const pdfBuffer = Buffer.from(header + body + xref + trailer, "utf8");
    fs.writeFileSync(filePath, pdfBuffer);

    return `/uploads/attachments/${filename}`;
  },
};
