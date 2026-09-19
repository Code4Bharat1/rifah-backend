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

      // Draw elegant borders
      const margin = 30;
      doc.rect(margin, margin, width - margin * 2, height - margin * 2)
         .lineWidth(4)
         .stroke(accentColor);

      const innerMargin = 38;
      doc.rect(innerMargin, innerMargin, width - innerMargin * 2, height - innerMargin * 2)
         .lineWidth(1)
         .stroke(accentColor);

      // Draw corner accents
      const cornerSize = 25;
      const drawCorner = (x, y, dx, dy) => {
        doc.moveTo(x + dx, y)
           .lineTo(x, y)
           .lineTo(x, y + dy)
           .lineWidth(3)
           .stroke(accentColor);
      };
      drawCorner(innerMargin - 4, innerMargin - 4, cornerSize, cornerSize); // Top-Left
      drawCorner(width - innerMargin + 4, innerMargin - 4, -cornerSize, cornerSize); // Top-Right
      drawCorner(innerMargin - 4, height - innerMargin + 4, cornerSize, -cornerSize); // Bottom-Left
      drawCorner(width - innerMargin + 4, height - innerMargin + 4, -cornerSize, -cornerSize); // Bottom-Right

      // Logo
      const logoPath = path.resolve(process.cwd(), "..", "rifah-frontend", "public", "rifah-logo.png");
      if (fs.existsSync(logoPath)) {
        doc.image(logoPath, width / 2 - 60, 50, { width: 120 });
      }

      // Header
      doc.fontSize(42)
         .fillColor(accentColor)
         .font("Helvetica-Bold")
         .text("CERTIFICATE", 0, 130, { align: "center", tracking: 4 });

      doc.fontSize(18)
         .fillColor("#666666")
         .font("Helvetica")
         .text("OF PARTICIPATION", 0, 180, { align: "center", tracking: 2 });

      // Body text
      doc.fontSize(16)
         .fillColor("#444444")
         .font("Helvetica-Oblique")
         .text("This is proudly presented to", 0, 240, { align: "center" });

      // Attendee Name
      doc.fontSize(38)
         .fillColor(accentColor)
         .font("Helvetica-Bold")
         .text(attendee.name.toUpperCase(), 0, 280, { align: "center" });

      // Separator line under name
      doc.moveTo(width / 2 - 200, 325)
         .lineTo(width / 2 + 200, 325)
         .lineWidth(1.5)
         .stroke("#cccccc");

      // Event details
      doc.fontSize(16)
         .fillColor("#444444")
         .font("Helvetica")
         .text(`For participating in`, 0, 350, { align: "center" });

      doc.fontSize(20)
         .fillColor("#222222")
         .font("Helvetica-Bold")
         .text(`${eventDetails.title}`, 0, 375, { align: "center" });

      doc.fontSize(14)
         .fillColor("#666666")
         .font("Helvetica")
         .text(`Held on ${eventDetails.date} by RIFAH ${eventDetails.chapter}`, 0, 405, { align: "center" });

      // Signatures
      const sigY = 485;
      
      // Signature 1
      doc.moveTo(180, sigY)
         .lineTo(340, sigY)
         .lineWidth(1)
         .stroke("#000000");
      
      doc.fontSize(12)
         .fillColor("#333333")
         .font("Helvetica-Bold")
         .text(eventDetails.signatory1Role || "Chapter President", 180, sigY + 10, { width: 160, align: "center" });

      // Signature 2
      doc.moveTo(502, sigY)
         .lineTo(662, sigY)
         .lineWidth(1)
         .stroke("#000000");
      
      doc.fontSize(12)
         .text(eventDetails.signatory2Role || "Chapter Secretary", 502, sigY + 10, { width: 160, align: "center" });

      // Serial Number & Footer
      const cleanChapter = (eventDetails.chapter || "").replace(/\s+/g, "").substring(0, 3).toUpperCase();
      const serialNumber = `RIFAH-${cleanChapter || "GLB"}-${(attendee.id || "000000").substring(0, 6).toUpperCase()}`;
      
      doc.fontSize(10)
         .fillColor("#999999")
         .font("Helvetica")
         .text(`Serial No: ${serialNumber}`, 60, height - 60);

      doc.fontSize(10)
         .fillColor("#999999")
         .text(`RIFAH Chamber of Commerce and Industry`, 0, height - 60, { align: "center" });

      doc.end();
    } catch (error) {
      reject(error);
    }
  });
};
