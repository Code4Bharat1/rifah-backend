import PDFDocument from "pdfkit";
import QRCode from "qrcode";

/**
 * Generates an executive, beautifully formatted Event Entry Ticket / Pass PDF Buffer
 * @param {Object} options - Ticket and event details
 * @returns {Promise<Buffer>}
 */
export async function generateEventTicketPdfBuffer({
  eventTitle,
  eventDate,
  location,
  chapter,
  userName,
  ticketType,
  ticketId,
  passUrl,
  isPaid,
  ticketPrice,
  amountPaid,
  baseAmount,
  gstAmount,
  paymentId,
  transactionId,
  invoiceNumber,
  isGuest = false,
  qrPngBuffer = null,
}) {
  // If QR code buffer not provided, generate high-res QR code
  let finalQrBuffer = qrPngBuffer;
  if (!finalQrBuffer && passUrl) {
    try {
      finalQrBuffer = await QRCode.toBuffer(passUrl, {
        type: "png",
        width: 360,
        margin: 2,
        errorCorrectionLevel: "M",
        color: {
          dark: "#071328",
          light: "#ffffff",
        },
      });
    } catch (qrErr) {
      console.error("[Ticket PDF] Failed to generate QR code:", qrErr);
    }
  }

  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        size: "A4",
        layout: "portrait",
        margin: 0,
        info: {
          Title: `RIFAH Event Pass - ${ticketId || "Ticket"}`,
          Author: "RIFAH Chamber of Commerce & Industry",
          Subject: "Official Event Entry Pass",
          Creator: "RIFAH Events Desk",
        },
      });

      const buffers = [];
      doc.on("data", (chunk) => buffers.push(chunk));
      doc.on("end", () => resolve(Buffer.concat(buffers)));
      doc.on("error", (err) => reject(err));

      const pageWidth = 595.28;
      const pageHeight = 841.89;

      // 1. Soft Slate Background
      doc.rect(0, 0, pageWidth, pageHeight).fill("#f1f5f9");

      // 2. Pre-measure dynamic sections to set optimal card height & centering
      const cardWidth = 490;
      const cardX = (pageWidth - cardWidth) / 2;
      const innerW = cardWidth - 48; // 442

      const finalPaidAmount = Number(
        amountPaid !== undefined && amountPaid !== null && Number(amountPaid) > 0
          ? amountPaid
          : (ticketPrice || 0)
      );
      const displayTitle = eventTitle || "RIFAH Event";
      const displayPassType = ticketType || (isPaid ? `Paid Pass (Rs. ${finalPaidAmount})` : (isGuest ? "Guest Pass" : "Member Pass"));
      const titleHeight = doc.heightOfString(displayTitle, { width: innerW, lineGap: 2 });

      // Rows for event details
      const detailRows = [
        { label: "Date & Time:", value: eventDate || "Upcoming Chamber Event" },
        { label: "Venue / Hall:", value: location || "Chamber Main Hall" },
        { label: "Ticket Pass:", value: displayPassType },
        { label: "Chapter / Zone:", value: chapter || "Global / Main" },
      ];

      if (isPaid && (paymentId || transactionId)) {
        const hasGst = Number(gstAmount) > 0 || (finalPaidAmount > (Number(baseAmount) || 0) && Number(baseAmount) > 0);
        const gstSuffix = hasGst ? " incl. GST" : "";
        detailRows.push({
          label: "Payment Ref:",
          value: `Paid (Rs. ${finalPaidAmount}${gstSuffix}) · ${paymentId || transactionId}`,
        });
      }

      let detailsContentHeight = 16;
      const measuredRows = detailRows.map((r) => {
        const valH = doc.heightOfString(r.value, { width: innerW - 130, lineGap: 1.5 });
        const rowH = Math.max(16, valH + 5);
        detailsContentHeight += rowH;
        return { ...r, rowH };
      });

      // Total estimated inner content height:
      // Header: 72 + Badge: 28 + Title: titleHeight + Attendee: 46 + Notch: 22 + QR Box: 222 + ScanText: 18 + Warn: 42 + Details: detailsContentHeight + Footer: 24
      const estimatedContentH = 72 + 28 + titleHeight + 46 + 22 + 222 + 18 + 42 + detailsContentHeight + 24;
      const cardHeight = Math.min(790, Math.max(700, estimatedContentH + 30));
      const cardY = (pageHeight - cardHeight) / 2;

      // Card Background (Pure White) with crisp rounded border
      doc.roundedRect(cardX, cardY, cardWidth, cardHeight, 16).fill("#ffffff");
      doc.roundedRect(cardX, cardY, cardWidth, cardHeight, 16).lineWidth(1.5).stroke("#cbd5e1");

      // Top Decorative Dual-Tone Header Stripe (Red & Blue)
      doc.save();
      doc.roundedRect(cardX, cardY, cardWidth, 6, 3).clip();
      doc.rect(cardX, cardY, cardWidth / 2, 6).fill("#dc2626");
      doc.rect(cardX + cardWidth / 2, cardY, cardWidth / 2, 6).fill("#0284c7");
      doc.restore();

      // Brand Title
      let curY = cardY + 22;
      doc.font("Helvetica-Bold").fontSize(19).fillColor("#071328").text("RIFAH CHAMBER", cardX, curY, {
        align: "center",
        width: cardWidth,
      });

      curY += 23;
      doc.font("Helvetica-Bold").fontSize(8.5).fillColor("#0284c7").text("CHAMBER OF COMMERCE & INDUSTRY", cardX, curY, {
        align: "center",
        width: cardWidth,
        characterSpacing: 1.5,
      });

      // Status Badge with Vector Checkmark
      curY += 18;
      const badgeWidth = isPaid ? 230 : 200;
      const badgeHeight = 22;
      const badgeX = cardX + (cardWidth - badgeWidth) / 2;
      doc.roundedRect(badgeX, curY, badgeWidth, badgeHeight, 11).fill("#ecfdf5");
      doc.roundedRect(badgeX, curY, badgeWidth, badgeHeight, 11).lineWidth(1).stroke("#86efac");

      // Crisp vector checkmark circle
      const checkX = badgeX + 15;
      const checkY = curY + 11;
      doc.circle(checkX, checkY, 5.5).fill("#16a34a");
      doc.save()
        .lineWidth(1.5)
        .strokeColor("#ffffff")
        .lineCap("round")
        .lineJoin("round")
        .moveTo(checkX - 2.5, checkY)
        .lineTo(checkX - 0.5, checkY + 2)
        .lineTo(checkX + 2.5, checkY - 2)
        .stroke();
      doc.restore();

      doc.font("Helvetica-Bold").fontSize(8).fillColor("#166534").text(
        isPaid ? "PAYMENT & REGISTRATION CONFIRMED" : "REGISTRATION CONFIRMED",
        badgeX + 24,
        curY + 6.5,
        { align: "center", width: badgeWidth - 30, characterSpacing: 0.5 }
      );

      // Event Title
      curY += 30;
      doc.font("Helvetica-Bold").fontSize(18).fillColor("#0f172a").text(displayTitle, cardX + 24, curY, {
        align: "center",
        width: innerW,
        lineGap: 2,
      });

      // ATTENDEE & PASS TYPE SPOTLIGHT CARD (Completely separate, zero overlap)
      curY += titleHeight + 8;
      const attendeeCardH = 46;
      const attendeeCardX = cardX + 24;

      doc.roundedRect(attendeeCardX, curY, innerW, attendeeCardH, 10).fill("#f8fafc");
      doc.roundedRect(attendeeCardX, curY, innerW, attendeeCardH, 10).lineWidth(1).stroke("#e2e8f0");

      // Left Attendee Info
      doc.font("Helvetica-Bold").fontSize(7.5).fillColor("#64748b").text("REGISTERED ATTENDEE", attendeeCardX + 14, curY + 9, {
        characterSpacing: 0.5,
      });
      doc.font("Helvetica-Bold").fontSize(13).fillColor("#0f172a").text(userName || (isGuest ? "Guest Attendee" : "Chamber Member"), attendeeCardX + 14, curY + 21, {
        width: 270,
        ellipsis: true,
      });

      // Right Pass Type Pill Badge
      const passBadgeW = 126;
      const passBadgeH = 24;
      const passBadgeX = attendeeCardX + innerW - passBadgeW - 12;
      const passBadgeY = curY + 11;
      doc.roundedRect(passBadgeX, passBadgeY, passBadgeW, passBadgeH, 12).fill("#e0f2fe");
      doc.roundedRect(passBadgeX, passBadgeY, passBadgeW, passBadgeH, 12).lineWidth(1).stroke("#bae6fd");
      doc.font("Helvetica-Bold").fontSize(8.5).fillColor("#0284c7").text(displayPassType.toUpperCase(), passBadgeX, passBadgeY + 7, {
        align: "center",
        width: passBadgeW,
        characterSpacing: 0.5,
        ellipsis: true,
      });

      // Ticket Notch & Perforation Line
      curY += attendeeCardH + 12;
      doc.save()
        .lineWidth(1)
        .strokeColor("#cbd5e1")
        .dash(4, { space: 4 })
        .moveTo(cardX + 20, curY)
        .lineTo(cardX + cardWidth - 20, curY)
        .stroke();
      doc.restore();

      // Notch cutouts
      doc.circle(cardX, curY, 9).fill("#f1f5f9");
      doc.circle(cardX + cardWidth, curY, 9).fill("#f1f5f9");
      doc.circle(cardX, curY, 9).lineWidth(1.5).stroke("#cbd5e1");
      doc.circle(cardX + cardWidth, curY, 9).lineWidth(1.5).stroke("#cbd5e1");

      // QR Pass Box Container
      curY += 12;
      const qrBoxW = 320;
      const qrBoxH = 222;
      const qrBoxX = cardX + (cardWidth - qrBoxW) / 2;

      doc.roundedRect(qrBoxX, curY, qrBoxW, qrBoxH, 12).fill("#f8fafc");
      doc.roundedRect(qrBoxX, curY, qrBoxW, qrBoxH, 12).lineWidth(1).stroke("#e2e8f0");

      doc.font("Helvetica-Bold").fontSize(8.5).fillColor("#64748b").text("OFFICIAL ENTRY QR PASS", qrBoxX, curY + 10, {
        align: "center",
        width: qrBoxW,
        characterSpacing: 1,
      });

      // QR Image (135x135)
      const qrSize = 135;
      const qrX = qrBoxX + (qrBoxW - qrSize) / 2;
      const qrY = curY + 26;

      if (finalQrBuffer) {
        doc.roundedRect(qrX - 4, qrY - 4, qrSize + 8, qrSize + 8, 8).fill("#ffffff");
        doc.roundedRect(qrX - 4, qrY - 4, qrSize + 8, qrSize + 8, 8).lineWidth(1).stroke("#cbd5e1");
        doc.image(finalQrBuffer, qrX, qrY, { width: qrSize, height: qrSize });
      }

      // Ticket ID Badge
      const tidW = 240;
      const tidH = 22;
      const tidX = qrBoxX + (qrBoxW - tidW) / 2;
      const tidY = qrY + qrSize + 9;
      doc.roundedRect(tidX, tidY, tidW, tidH, 6).fill("#f0f9ff");
      doc.roundedRect(tidX, tidY, tidW, tidH, 6).lineWidth(1).stroke("#7dd3fc");
      doc.font("Courier-Bold").fontSize(12).fillColor("#0284c7").text(ticketId || "RIFAH-EVT-ENTRY", tidX, tidY + 5.5, {
        align: "center",
        width: tidW,
        characterSpacing: 1,
      });

      // Scan instruction
      curY += qrBoxH + 6;
      doc.font("Helvetica").fontSize(9).fillColor("#64748b").text(
        "Please present this QR code or printed pass at the entrance gate for check-in",
        cardX + 24,
        curY,
        { align: "center", width: innerW }
      );

      // Warning Notice
      curY += 20;
      const warnH = 38;
      const warnX = cardX + 24;
      doc.roundedRect(warnX, curY, innerW, warnH, 8).fill("#fef2f2");
      doc.roundedRect(warnX, curY, innerW, warnH, 8).lineWidth(1).stroke("#f87171");

      doc.font("Helvetica-Bold").fontSize(8.5).fillColor("#dc2626").text(
        "CONFIDENTIAL: VALID FOR SINGLE ENTRY ONLY",
        warnX,
        curY + 7,
        { align: "center", width: innerW, characterSpacing: 0.3 }
      );
      doc.font("Helvetica").fontSize(7.5).fillColor("#991b1b").text(
        "This ticket is uniquely registered to your identity. Do not forward or share this pass.",
        warnX,
        curY + 21,
        { align: "center", width: innerW }
      );

      // Dynamic Event Details Grid (NO OVERLAPS!)
      curY += warnH + 10;
      const detailsX = cardX + 24;

      doc.roundedRect(detailsX, curY, innerW, detailsContentHeight, 10).fill("#f8fafc");
      doc.roundedRect(detailsX, curY, innerW, detailsContentHeight, 10).lineWidth(1).stroke("#e2e8f0");

      let curRowY = curY + 8;
      for (const r of measuredRows) {
        doc.font("Helvetica-Bold").fontSize(8.5).fillColor("#64748b").text(r.label, detailsX + 14, curRowY, { width: 100 });
        doc.font("Helvetica-Bold").fontSize(8.5).fillColor("#0f172a").text(r.value, detailsX + 116, curRowY, {
          width: innerW - 130,
          lineGap: 1.5,
        });
        curRowY += r.rowH;
      }

      // Footer
      curY += detailsContentHeight + 12;
      doc.font("Helvetica").fontSize(8).fillColor("#94a3b8").text(
        "RIFAH Chamber of Commerce & Industry · Events Desk · Official Digital Ticket",
        cardX,
        curY,
        { align: "center", width: cardWidth }
      );

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}
