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
  if (s.includes("corporate") || s.includes("navy")) return "corporate";
  if (s.includes("modern") || s.includes("minimal")) return "modern";
  if (s.includes("elegant") || s.includes("floral")) return "elegant";
  if (s.includes("gold") || s.includes("classic")) return "classic";
  return "classic";
};

export const generateCertificate = async (attendee, eventDetails, options = {}) => {
  // Resolve signatory signature images up-front (async DB lookups), since the
  // PDFDocument drawing below runs synchronously inside the Promise executor.
  const [sig1ImageBuffer, sig2ImageBuffer] = await Promise.all([
    loadImageBuffer(eventDetails.signatory1Image),
    loadImageBuffer(eventDetails.signatory2Image),
  ]);

  return new Promise((resolve, reject) => {
    try {
      const { style = "classic", accentColor = "#06b6d4" } = options;
      const styleKey = resolveStyleKey(style);

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

      const isCorporate = styleKey === "corporate";
      const isModern = styleKey === "modern";

      let headerTop = 130;

      if (isCorporate) {
        // "Corporate" design: navy band across the top with a gold rule beneath it,
        // clean typography — matches the schema's own default style description,
        // which the renderer never actually implemented.
        const bandHeight = 90;
        doc.rect(0, 0, width, bandHeight).fill("#0b1f3a");
        doc.rect(0, bandHeight, width, 4).fill(accentColor);
        doc.fontSize(30)
           .fillColor("#ffffff")
           .font("Helvetica-Bold")
           .text("CERTIFICATE OF PARTICIPATION", 0, bandHeight / 2 - 15, { align: "center", tracking: 2 });
        headerTop = bandHeight + 40;
      } else {
        // Classic / modern / elegant: bordered card. Corner accents are skipped for
        // the "modern/minimal" variant to keep the frame clean.
        const margin = 30;
        doc.rect(margin, margin, width - margin * 2, height - margin * 2)
           .lineWidth(4)
           .stroke(accentColor);

        const innerMargin = 38;
        doc.rect(innerMargin, innerMargin, width - innerMargin * 2, height - innerMargin * 2)
           .lineWidth(1)
           .stroke(accentColor);

        if (!isModern) {
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
        }
      }

      // Logo
      const logoPath = path.resolve(process.cwd(), "..", "rifah-frontend", "public", "rifah-logo.png");
      if (fs.existsSync(logoPath) && !isCorporate) {
        doc.image(logoPath, width / 2 - 60, 50, { width: 120 });
      }

      if (!isCorporate) {
        // Header
        doc.fontSize(42)
           .fillColor(accentColor)
           .font("Helvetica-Bold")
           .text("CERTIFICATE", 0, headerTop, { align: "center", tracking: 4 });

        doc.fontSize(18)
           .fillColor("#666666")
           .font("Helvetica")
           .text("OF PARTICIPATION", 0, headerTop + 50, { align: "center", tracking: 2 });
      }

      const bodyTop = isCorporate ? headerTop + 20 : 240;

      // Body text
      doc.fontSize(16)
         .fillColor("#444444")
         .font("Helvetica-Oblique")
         .text("This is proudly presented to", 0, bodyTop, { align: "center" });

      // Attendee Name
      doc.fontSize(38)
         .fillColor(accentColor)
         .font("Helvetica-Bold")
         .text(attendee.name.toUpperCase(), 0, bodyTop + 40, { align: "center" });

      // Separator line under name
      doc.moveTo(width / 2 - 200, bodyTop + 85)
         .lineTo(width / 2 + 200, bodyTop + 85)
         .lineWidth(1.5)
         .stroke("#cccccc");

      // Event details
      doc.fontSize(16)
         .fillColor("#444444")
         .font("Helvetica")
         .text(`For participating in`, 0, bodyTop + 110, { align: "center" });

      doc.fontSize(20)
         .fillColor("#222222")
         .font("Helvetica-Bold")
         .text(`${eventDetails.title}`, 0, bodyTop + 135, { align: "center" });

      doc.fontSize(14)
         .fillColor("#666666")
         .font("Helvetica")
         .text(`Held on ${eventDetails.date} by RIFAH ${eventDetails.chapter}`, 0, bodyTop + 165, { align: "center" });

      // Signatures
      // BUG-039: previously only the *role* label (e.g. "Chapter Secretary") was ever
      // drawn for either signatory — the signatory's actual name and uploaded
      // signature image were captured in the settings form but never rendered, so a
      // "second signature" never appeared (and neither did the first, meaningfully).
      const sigY = 485;
      const drawSignatory = (x, name, role, imageBuffer) => {
        if (imageBuffer) {
          try {
            doc.image(imageBuffer, x + 20, sigY - 42, { width: 120, height: 40, fit: [120, 40] });
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

      drawSignatory(180, eventDetails.signatory1Name, eventDetails.signatory1Role || "Chapter President", sig1ImageBuffer);
      drawSignatory(502, eventDetails.signatory2Name, eventDetails.signatory2Role || "Chapter Secretary", sig2ImageBuffer);

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
