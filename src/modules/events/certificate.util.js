import PDFDocument from "pdfkit";
import fs from "fs";
import path from "path";

export const generateCertificate = async (attendee, eventDetails, options = {}) => {
  return new Promise((resolve, reject) => {
    try {
      const { style = "classic", accentColor = "#06b6d4" } = options;
      
      const doc = new PDFDocument({
        layout: "landscape",
        size: "A4",
        margin: 0
      });

      const buffers = [];
      doc.on("data", buffers.push.bind(buffers));
      doc.on("end", () => {
        resolve(Buffer.concat(buffers));
      });

      // A4 Landscape is 842 x 595
      const width = 842;
      const height = 595;

      // Draw background
      doc.rect(0, 0, width, height).fill("#ffffff");

      // Draw borders depending on style
      doc.rect(20, 20, width - 40, height - 40)
         .lineWidth(4)
         .stroke(accentColor);

      doc.rect(26, 26, width - 52, height - 52)
         .lineWidth(1)
         .stroke(accentColor);

      // Header
      doc.fontSize(40)
         .fillColor(accentColor)
         .font("Helvetica-Bold")
         .text("CERTIFICATE", 0, 120, { align: "center" });

      doc.fontSize(20)
         .fillColor("#666666")
         .font("Helvetica")
         .text("OF PARTICIPATION", 0, 165, { align: "center" });

      // Body text
      doc.fontSize(16)
         .fillColor("#333333")
         .text("This is proudly presented to", 0, 230, { align: "center" });

      // Attendee Name
      doc.fontSize(36)
         .fillColor(accentColor)
         .font("Helvetica-Bold")
         .text(attendee.name.toUpperCase(), 0, 270, { align: "center" });

      // Separator line
      doc.moveTo(220, 315)
         .lineTo(622, 315)
         .lineWidth(1)
         .stroke(accentColor);

      // Event details
      doc.fontSize(16)
         .fillColor("#333333")
         .font("Helvetica")
         .text(`for participating in ${eventDetails.title}`, 0, 340, { align: "center" });

      doc.fontSize(14)
         .text(`held on ${eventDetails.date} by RIFAH ${eventDetails.chapter}`, 0, 370, { align: "center" });

      // Signatures
      const sigY = 460;
      
      // Signature 1
      doc.moveTo(150, sigY)
         .lineTo(350, sigY)
         .lineWidth(1)
         .stroke("#000000");
      
      doc.fontSize(12)
         .fillColor("#333333")
         .text(eventDetails.signatory1Role || "Chapter President", 150, sigY + 10, { width: 200, align: "center" });

      // Signature 2
      doc.moveTo(492, sigY)
         .lineTo(692, sigY)
         .lineWidth(1)
         .stroke("#000000");
      
      doc.text(eventDetails.signatory2Role || "Chapter Secretary", 492, sigY + 10, { width: 200, align: "center" });

      // Add a simple Serial Number at bottom left
      const serialNumber = `RIFAH-${eventDetails.chapter.replace(/\s+/g, "").substring(0, 3).toUpperCase()}-${attendee.id.substring(0, 6).toUpperCase()}`;
      doc.fontSize(10)
         .fillColor("#999999")
         .text(`Serial No: ${serialNumber}`, 40, height - 40);

      doc.end();
    } catch (error) {
      reject(error);
    }
  });
};
