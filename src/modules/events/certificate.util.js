import PDFDocument from "pdfkit";
import fs from "fs";
import path from "path";
import { File } from "../files/file.model.js";

// Signatory images are stored via storageService as MongoDB-backed files, served at
// "/api/v1/files/:id" (see storageService.uploadFile) — not as filesystem paths — so
// they must be loaded from the DB as a Buffer for pdfkit, not read off disk.
const loadImageBuffer = async (imageRef) => {
  if (!imageRef) return null;
  try {
    const match = String(imageRef).match(/\/api\/v1\/files\/([a-f0-9]{24})/i);
    if (match) {
      const fileDoc = await File.findById(match[1]).select("data");
      return fileDoc?.data || null;
    }
    if (fs.existsSync(imageRef)) {
      return fs.readFileSync(imageRef);
    }
  } catch {
    // Fall through to text-only rendering below.
  }
  return null;
};

// BUG-037/038: `style` used to be destructured and then never referenced anywhere in
// this function, so every certificate rendered identically no matter which design the
// admin picked in Operations Centre > Certificate settings. This resolves the chosen
// style string (e.g. "5 — Corporate (navy band, gold rule, clean typography)") to a
// concrete layout variant so the selected design actually changes the output.
const resolveStyleKey = (style) => {
  const s = String(style || "").toLowerCase();
  
  // New styles
  if (s.includes("rifah-signature")) return "rifah-signature";
  if (s.includes("royal-heritage")) return "royal-heritage";
  if (s.includes("executive-gold")) return "executive-gold";
  if (s.includes("professional-frame")) return "professional-frame";
  if (s.includes("premium-achievement")) return "premium-achievement";
  if (s.includes("clean-prestige")) return "clean-prestige";

  // Old styles (for backward compatibility of generated certificates)
  if (s.includes("corporate") || s.includes("navy")) return "corporate";
  if (s.includes("modern") || s.includes("minimal")) return "modern";
  if (s.includes("elegant") || s.includes("floral")) return "elegant";
  if (s.includes("gold") || s.includes("classic")) return "classic";
  
  return "rifah-signature"; // Default to new signature style
};

export const generateCertificate = async (attendee, eventDetails, options = {}) => {
  // Safe extraction of design overrides if provided
  const design = eventDetails.certificateDesign || {};
  const dTitle = design.title?.text || "CERTIFICATE OF PARTICIPATION";
  const dTitleFont = design.title?.fontFamily === "Times-Bold" || design.title?.fontFamily === "Times-BoldItalic" ? "Times-Bold" : (design.title?.fontFamily || "Helvetica-Bold");
  const dPartFont = design.participantName?.fontFamily === "Times-Bold" || design.participantName?.fontFamily === "Times-BoldItalic" ? "Times-BoldItalic" : (design.participantName?.fontFamily || "Helvetica-Bold");
  const dBody = design.body?.text || "This is proudly presented to\n{{participantName}}\nfor participating in\n{{eventName}}\nheld on {{eventDate}} by RIFAH {{chapterName}}";
  
  const parsedBody = dBody.replace("{{participantName}}", attendee.name || "Participant Name")
                          .replace("{{eventName}}", eventDetails.title || "RIFAH Event")
                          .replace("{{eventDate}}", eventDetails.date || "")
                          .replace("{{chapterName}}", eventDetails.chapter || "Chapter");

  const hasBorder = design.border?.enabled !== false;
  const bgColor = design.background?.color || "#ffffff";
  const accentColor = eventDetails.certificateAccentColor || options.accentColor || "#0088d1";

  // Resolve signatory signature images up-front (async DB lookups)
  const [sig1ImageBuffer, sig2ImageBuffer, logoImageBuffer] = await Promise.all([
    loadImageBuffer(eventDetails.signatory1Image),
    loadImageBuffer(eventDetails.signatory2Image),
    loadImageBuffer(eventDetails.logoImage),
  ]);

  return new Promise((resolve, reject) => {
    try {
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
      doc.rect(0, 0, width, height).fill(bgColor);

      // Draw Border
      if (hasBorder) {
        const borderWidth = design.border?.width || 8;
        const borderColor = design.border?.color || accentColor || '#0b1f33';
        doc.rect(borderWidth/2, borderWidth/2, width - borderWidth, height - borderWidth)
           .lineWidth(borderWidth)
           .stroke(borderColor);
      }

      // Draw Logo
      if (design.logo?.enabled !== false) {
        let actualLogoBuffer = logoImageBuffer;
        if (!actualLogoBuffer) {
           const fallbackLogoPath = path.resolve(process.cwd(), "..", "rifah-frontend", "public", "rifah-logo.png");
           if (fs.existsSync(fallbackLogoPath)) {
             actualLogoBuffer = fs.readFileSync(fallbackLogoPath);
           }
        }
        
        if (actualLogoBuffer) {
           const logoWidth = design.logo?.width || 120;
           try {
             doc.image(actualLogoBuffer, width / 2 - logoWidth / 2, 40, { width: logoWidth });
           } catch {
             // fallback
           }
        }
      }

      // Draw Header Text (RIFAH Chamber)
      doc.fontSize(28)
         .fillColor('#0b1f33')
         .font("Times-Bold")
         .text("RIFAH CHAMBER", 0, 110, { align: "center", tracking: 4 });

      // Draw Title
      doc.fontSize(design.title?.fontSize || 42)
         .fillColor(design.title?.color || accentColor)
         .font(dTitleFont)
         .text(dTitle.toUpperCase(), 0, 160, { align: "center", tracking: 2 });

      // Body text template rendering
      // We will render it line by line based on the parsed string
      let bodyY = 240;
      const lines = parsedBody.split('\n');
      lines.forEach(line => {
         if (line === attendee.name || line.toUpperCase() === attendee.name.toUpperCase()) {
            doc.fontSize(design.participantName?.fontSize || 38)
               .fillColor(design.participantName?.color || accentColor)
               .font(dPartFont)
               .text(line, 0, bodyY, { align: "center" });
            bodyY += 50;
         } else if (line === eventDetails.title || line.toUpperCase() === eventDetails.title.toUpperCase()) {
            doc.fontSize(20)
               .fillColor("#222222")
               .font("Helvetica-Bold")
               .text(line, 0, bodyY, { align: "center" });
            bodyY += 30;
         } else {
            doc.fontSize(16)
               .fillColor("#444444")
               .font("Helvetica")
               .text(line, 0, bodyY, { align: "center" });
            bodyY += 25;
         }
      });

      // Signatures
      const sigY = 485;
      const drawSignatory = (x, name, role, imageBuffer) => {
        if (imageBuffer) {
          try {
            doc.image(imageBuffer, x + 20, sigY - 50, { width: 120, height: 40, fit: [120, 40] });
          } catch {
            // Ignore unreadable/corrupt image data — fall back to the text line below.
          }
        }

        doc.moveTo(x, sigY)
           .lineTo(x + 160, sigY)
           .lineWidth(1)
           .stroke("#000000");

        if (name) {
          doc.fontSize(13)
             .fillColor("#111111")
             .font("Helvetica-Bold")
             .text(name, x, sigY + 8, { width: 160, align: "center" });
          doc.fontSize(11)
             .fillColor("#555555")
             .font("Helvetica")
             .text(role || "", x, sigY + 24, { width: 160, align: "center" });
        } else {
          doc.fontSize(12)
             .fillColor("#333333")
             .font("Helvetica-Bold")
             .text(role || "", x, sigY + 10, { width: 160, align: "center" });
        }
      };

      if (eventDetails.signatory1Name || eventDetails.signatory1Role || sig1ImageBuffer) {
         drawSignatory(180, eventDetails.signatory1Name, eventDetails.signatory1Role, sig1ImageBuffer);
      }
      if (eventDetails.signatory2Name || eventDetails.signatory2Role || sig2ImageBuffer) {
         drawSignatory(502, eventDetails.signatory2Name, eventDetails.signatory2Role, sig2ImageBuffer);
      }

      // Serial Number & Footer
      const cleanChapter = (eventDetails.chapter || "").replace(/\s+/g, "").substring(0, 3).toUpperCase();
      const serialNumber = `RIFAH-${cleanChapter || "GLB"}-${(attendee.id || "000000").substring(0, 6).toUpperCase()}`;

      doc.fontSize(10)
         .fillColor("#999999")
         .font("Helvetica")
         .text(`Serial No: ${serialNumber}`, 60, height - 40);

      doc.fontSize(10)
         .fillColor("#999999")
         .text(`RIFAH Chamber of Commerce and Industry`, 0, height - 40, { align: "center" });

      doc.end();
    } catch (error) {
      reject(error);
    }
  });
};
