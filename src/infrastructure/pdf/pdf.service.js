import fs from "fs";
import path from "path";
import PDFDocument from "pdfkit";
import { storageService } from "../storage/storage.service.js";
import { cloudinaryService } from "../storage/cloudinary.service.js";
import { logger } from "../logger/logger.js";

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

const SIGNATURE_PRESETS = [
  {
    name: "Classic Flourish",
    path: "M 12 36 C 18 12, 32 6, 44 16 C 52 24, 46 44, 34 50 C 22 56, 18 42, 36 30 C 52 18, 68 36, 80 40 C 90 44, 98 26, 108 36 C 118 44, 126 24, 136 34 C 146 42, 154 28, 164 36 C 174 42, 182 32, 192 38 M 22 54 Q 100 44, 178 48 Q 194 49, 204 42 M 194 38 L 202 46",
    color: "#0f2942",
  },
  {
    name: "Executive Swift",
    path: "M 16 42 C 24 10, 42 8, 46 26 C 48 38, 38 52, 26 46 C 16 40, 28 20, 52 24 C 74 28, 64 52, 84 40 C 96 30, 108 14, 122 26 C 134 36, 128 48, 142 42 C 154 36, 164 22, 174 30 C 184 38, 180 50, 194 44 M 18 50 Q 106 60, 192 48 Q 204 46, 212 40",
    color: "#1e3a8a",
  },
  {
    name: "Authoritative Ascender",
    path: "M 20 48 C 30 14, 46 8, 50 30 C 52 46, 38 56, 28 50 C 18 44, 32 22, 60 26 C 86 30, 72 56, 92 44 C 108 34, 118 16, 134 30 C 148 42, 140 54, 156 46 C 170 38, 180 24, 192 34 C 202 42, 198 56, 212 48 M 24 56 Q 112 64, 198 52 Q 212 50, 220 42",
    color: "#172554",
  },
  {
    name: "Calligraphic Ribbon",
    path: "M 14 38 C 22 16, 36 10, 48 22 C 56 30, 50 48, 38 52 C 26 56, 22 42, 40 32 C 58 20, 74 38, 86 42 C 96 46, 104 28, 114 38 C 124 46, 132 26, 142 36 C 152 44, 160 30, 170 38 C 180 44, 188 34, 198 40 M 26 54 Q 104 46, 184 50 Q 200 51, 210 44 M 198 40 L 208 48",
    color: "#0e3a5a",
  },
];

export const pdfService = {
  /**
   * Generates raw PDF Buffer for a B2B quotation
   */
  generateQuotationBuffer: ({
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
    const cleanRef = (quotationRef || "QTN").replace(/[^a-zA-Z0-9_-]/g, "");
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

    return Buffer.from(header + body + xref + trailer, "utf8");
  },

  /**
   * Generates high-resolution vector PDF buffer for official RIFAH Certificate of Completion
   */
  generateCertificateBuffer: async ({
    recipientName = "Member",
    courseTitle = "Business Leadership & Entrepreneurship Training",
    companyName = "RIFAH Member Enterprise",
    chapterName = "RIFAH Chamber",
    scope = "centre",
    moduleCount = 1,
    courseInfo = null,
    certificateNumber = "CERT-2026-HQ",
    date = new Date(),
  } = {}) => {
    return new Promise((resolve, reject) => {
      try {
        const doc = new PDFDocument({
          layout: "landscape",
          size: "A4",
          margin: 0,
        });

        const buffers = [];
        doc.on("data", (chunk) => buffers.push(chunk));
        doc.on("end", () => resolve(Buffer.concat(buffers)));
        doc.on("error", reject);

        const width = 842;
        const height = 595;
        const accentColor = "#00875A"; // Official RIFAH Emerald Green

        // Background
        doc.rect(0, 0, width, height).fill("#ffffff");

        // Outer border
        const outerMargin = 28;
        doc.rect(outerMargin, outerMargin, width - outerMargin * 2, height - outerMargin * 2)
           .lineWidth(3.5)
           .stroke(accentColor);

        // Inner border
        const innerMargin = 35;
        doc.rect(innerMargin, innerMargin, width - innerMargin * 2, height - innerMargin * 2)
           .lineWidth(1)
           .stroke(accentColor);

        // 4 Corner Brackets
        const cornerSize = 22;
        const drawCorner = (x, y, dx, dy) => {
          doc.moveTo(x + dx, y)
             .lineTo(x, y)
             .lineTo(x, y + dy)
             .lineWidth(2.5)
             .stroke(accentColor);
        };
        drawCorner(innerMargin - 4, innerMargin - 4, cornerSize, cornerSize); // Top-Left
        drawCorner(width - innerMargin + 4, innerMargin - 4, -cornerSize, cornerSize); // Top-Right
        drawCorner(innerMargin - 4, height - innerMargin + 4, cornerSize, -cornerSize); // Bottom-Left
        drawCorner(width - innerMargin + 4, height - innerMargin + 4, -cornerSize, -cornerSize); // Bottom-Right

        // Logo
        let logoPath = path.resolve(process.cwd(), "..", "rifah-frontend", "public", "rifah-logo.png");
        if (!fs.existsSync(logoPath)) {
          logoPath = path.resolve(process.cwd(), "public", "rifah-logo.png");
        }
        if (fs.existsSync(logoPath)) {
          const logoWidth = 145;
          doc.image(logoPath, (width - logoWidth) / 2, 50, { width: logoWidth });
        }

        // Heading: CERTIFICATE
        doc.fontSize(40)
           .fillColor(accentColor)
           .font("Times-Bold")
           .text("CERTIFICATE", 0, 138, { align: "center", characterSpacing: 6 });

        // Subtitle: OF COMPLETION
        doc.fontSize(13)
           .fillColor("#475569")
           .font("Helvetica")
           .text("OF COMPLETION", 0, 186, { align: "center", characterSpacing: 4 });

        // Italic: This is proudly presented to
        doc.fontSize(13.5)
           .fillColor("#64748B")
           .font("Times-Italic")
           .text("This is proudly presented to", 0, 222, { align: "center" });

        // Recipient Name
        doc.fontSize(38)
           .fillColor("#0F172A")
           .font("Times-Bold")
           .text(recipientName, 0, 248, { align: "center" });

        // Underline Accent Rule
        const ruleWidth = 320;
        doc.moveTo((width - ruleWidth) / 2, 298)
           .lineTo((width + ruleWidth) / 2, 298)
           .lineWidth(1)
           .stroke("#CBD5E1");

        // Reason
        doc.fontSize(13)
           .fillColor("#475569")
           .font("Helvetica")
           .text("For successfully completing all modules, practical curriculum, and requirements of", 0, 314, { align: "center" });

        // Format Course Title in Clean Title Case
        const formatTitle = (str) => {
          if (!str) return "Executive Training Course";
          return str
            .split(" ")
            .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
            .join(" ");
        };

        const formattedCourseTitle = formatTitle(courseTitle);
        doc.fontSize(20)
           .fillColor("#0F172A")
           .font("Helvetica-Bold")
           .text(formattedCourseTitle, 0, 334, { align: "center" });

        // Course Track, Scope & Modules Information
        let scopeLabel = "Central Chamber National Leadership Program";
        if (scope === "state") {
          scopeLabel = "State Executive Curriculum";
        } else if (scope === "chapter") {
          scopeLabel = chapterName ? `${chapterName} Chapter Leadership Training` : "Chapter Administration & Executive Development Program";
        }

        const infoText = courseInfo || `Curriculum Track: ${scopeLabel} • ${moduleCount} Module${moduleCount > 1 ? "s" : ""} Completed`;

        doc.fontSize(11)
           .fillColor(accentColor)
           .font("Helvetica-Bold")
           .text(infoText, 0, 360, { align: "center" });

        // Business Name Attribution
        if (companyName && companyName.toLowerCase() !== recipientName.toLowerCase()) {
          doc.fontSize(12.5)
             .fillColor("#475569")
             .font("Helvetica")
             .text(`Representing Enterprise: ${companyName}`, 0, 380, { align: "center" });
        }

        // Pick random realistic signatures
        const leftSigIdx = Math.floor(Math.random() * SIGNATURE_PRESETS.length);
        const rightSigIdx = (leftSigIdx + 1 + Math.floor(Math.random() * (SIGNATURE_PRESETS.length - 1))) % SIGNATURE_PRESETS.length;
        const leftSig = SIGNATURE_PRESETS[leftSigIdx];
        const rightSig = SIGNATURE_PRESETS[rightSigIdx];

        // Signatures
        const sigY = 460;
        const sigLineWidth = 180;

        // Left Signatory (Chapter President)
        const leftX = 140;

        // Render Left Handwritten Signature above line
        doc.save();
        doc.translate(leftX - 8, sigY - 48);
        doc.scale(0.92);
        doc.path(leftSig.path)
           .lineWidth(1.9)
           .strokeColor(leftSig.color || "#0f2942")
           .stroke();
        doc.restore();

        doc.moveTo(leftX, sigY)
           .lineTo(leftX + sigLineWidth, sigY)
           .lineWidth(1)
           .stroke("#94A3B8");

        doc.fontSize(11)
           .fillColor("#0F172A")
           .font("Helvetica-Bold")
           .text(chapterName ? `${chapterName} Chapter` : "RIFAH Chamber", leftX, sigY + 8, { width: sigLineWidth, align: "center" });

        doc.fontSize(9.5)
           .fillColor("#64748B")
           .font("Helvetica")
           .text("CHAPTER PRESIDENT", leftX, sigY + 22, { width: sigLineWidth, align: "center", characterSpacing: 1 });

        // Right Signatory (Director General)
        const rightX = width - 140 - sigLineWidth;

        // Render Right Handwritten Signature above line
        doc.save();
        doc.translate(rightX - 8, sigY - 48);
        doc.scale(0.92);
        doc.path(rightSig.path)
           .lineWidth(1.9)
           .strokeColor(rightSig.color || "#1e3a8a")
           .stroke();
        doc.restore();

        doc.moveTo(rightX, sigY)
           .lineTo(rightX + sigLineWidth, sigY)
           .lineWidth(1)
           .stroke("#94A3B8");

        doc.fontSize(11)
           .fillColor("#0F172A")
           .font("Helvetica-Bold")
           .text("RIFAH Central HQ", rightX, sigY + 8, { width: sigLineWidth, align: "center" });

        doc.fontSize(9.5)
           .fillColor("#64748B")
           .font("Helvetica")
           .text("DIRECTOR GENERAL", rightX, sigY + 22, { width: sigLineWidth, align: "center", characterSpacing: 1 });

        // Footer
        const footerY = 530;
        doc.fontSize(9)
           .fillColor("#94A3B8")
           .font("Helvetica")
           .text(`ID: ${certificateNumber}`, innerMargin + 15, footerY);

        doc.fontSize(9.5)
           .fillColor("#94A3B8")
           .font("Helvetica")
           .text("RIFAH Chamber of Commerce and Industry", 0, footerY, { align: "center" });

        const formattedDate = (date ? new Date(date) : new Date()).toLocaleDateString("en-IN", {
          day: "numeric",
          month: "short",
          year: "numeric",
        });
        doc.fontSize(9)
           .fillColor("#94A3B8")
           .font("Helvetica")
           .text(`Issued: ${formattedDate}`, width - innerMargin - 125, footerY, { width: 110, align: "right" });

        doc.end();
      } catch (err) {
        reject(err);
      }
    });
  },

  /**
   * Generates a clean official document preview PDF buffer for verification documents
   */
  generateDocumentPlaceholderBuffer: ({
    filename = "document.pdf",
    title = "Official Compliance & Verification Document",
    documentType = "Member Verification Document",
    date = new Date(),
  } = {}) => {
    const cleanFilename = escapePdfText(filename);
    const dateStr = date
      ? new Date(date).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })
      : new Date().toLocaleDateString("en-IN");

    const streamLines = [
      // Top header band (Deep Blue)
      "0.05 0.22 0.45 rg",
      "0 740 595 102 re f",

      // Header Title
      "BT",
      "/F2 16 Tf",
      "1 1 1 rg",
      "40 795 Td",
      "(RIFAH CHAMBER OF COMMERCE & INDUSTRY) Tj",
      "/F1 10 Tf",
      "0.85 0.9 1 rg",
      "0 -18 Td",
      "(Official Member Verification & Compliance Registry) Tj",
      "ET",

      // Main Card Box
      "0.98 0.99 1.0 rg",
      "40 380 515 320 re f",
      "0.82 0.88 0.94 RG",
      "40 380 515 320 re S",

      // Document Type Badge
      "0.9 0.95 0.92 rg",
      "55 645 220 28 re f",
      "0.3 0.7 0.4 RG",
      "55 645 220 28 re S",

      "BT",
      "/F2 10 Tf",
      "0.1 0.5 0.2 rg",
      "65 655 Td",
      "(OFFICIAL VERIFICATION DOCUMENT) Tj",
      "ET",

      // Document Title & Meta
      "BT",
      "/F2 14 Tf",
      "0.1 0.15 0.25 rg",
      "55 605 Td",
      `(${escapePdfText(title)}) Tj`,
      "/F1 10 Tf",
      "0.4 0.45 0.5 rg",
      "0 -22 Td",
      `(${escapePdfText(`File Name: ${cleanFilename}`)}) Tj`,
      "0 -18 Td",
      `(${escapePdfText(`Classification: ${documentType}`)}) Tj`,
      "0 -18 Td",
      `(${escapePdfText(`Recorded Timestamp: ${dateStr}`)}) Tj`,
      "0 -18 Td",
      "(Security Status: Cryptographically Registered on RIFAH Connect) Tj",
      "ET",

      // Central Admin Verification Box
      "0.95 0.97 0.99 rg",
      "55 405 485 65 re f",
      "0.75 0.82 0.92 RG",
      "55 405 485 65 re S",

      "BT",
      "/F2 10 Tf",
      "0.05 0.3 0.6 rg",
      "70 450 Td",
      "(CHAMBER CENTRAL ADMIN DIGITAL VERIFICATION DESK) Tj",
      "/F1 9 Tf",
      "0.3 0.35 0.4 rg",
      "0 -16 Td",
      "(This document has been archived in the chamber compliance records for business verification.) Tj",
      "0 -14 Td",
      "(Authorized by the RIFAH Central & Regional Chapter Accreditation Board.) Tj",
      "ET",

      // Footer divider
      "0.88 0.91 0.95 RG",
      "0.5 w",
      "40 100 m 555 100 l S",

      "BT",
      "/F2 9 Tf",
      "0.05 0.3 0.6 rg",
      "40 82 Td",
      "(RIFAH CONNECT - VERIFIED COMPLIANCE RECORD) Tj",
      "/F1 8 Tf",
      "0.45 0.5 0.55 rg",
      "0 -14 Td",
      "(Certified digital archive copy. For inquiries, contact admin@rifah.org) Tj",
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

    return Buffer.from(header + body + xref + trailer, "utf8");
  },

  /**
   * Generates a clean, professional B2B quotation PDF
   */
  generateQuotationPdf: async (data) => {
    const baseDir = storageService.getBaseUploadDir();
    const attachmentsDir = path.join(baseDir, "attachments");
    if (!fs.existsSync(attachmentsDir)) {
      fs.mkdirSync(attachmentsDir, { recursive: true });
    }

    const cleanRef = (data.quotationRef || "QTN").replace(/[^a-zA-Z0-9_-]/g, "");
    const filename = `quotation-${cleanRef}-${Date.now()}.pdf`;
    const filePath = path.join(attachmentsDir, filename);

    const pdfBuffer = pdfService.generateQuotationBuffer(data);
    fs.writeFileSync(filePath, pdfBuffer);

    if (cloudinaryService.isConfigured()) {
      try {
        const result = await cloudinaryService.upload(filePath, {
          folder: "rifah/attachments",
          resource_type: "auto",
          public_id: filename.replace(/\.[^/.]+$/, ""),
        });
        if (result && result.secure_url) {
          logger.info(`Quotation PDF uploaded to Cloudinary: ${result.secure_url}`);
          return result.secure_url;
        }
      } catch (cloudErr) {
        logger.error("Cloudinary upload failed for quotation PDF, falling back to local file:", cloudErr);
      }
    }

    return `/uploads/attachments/${filename}`;
  },
};

