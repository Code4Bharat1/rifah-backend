/**
 * Helper to apply professional formatting and column styling to ExcelJS worksheets
 */
export const applyWorksheetStyles = (worksheet, headerColorHex = "1E293B", accentColorHex = "3B82F6") => {
  // 1. Freeze top header row
  worksheet.views = [{ state: "frozen", ySplit: 1, activeCell: "A2" }];

  // 2. Format Header Row
  const headerRow = worksheet.getRow(1);
  headerRow.height = 28;
  headerRow.eachCell((cell) => {
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: `FF${headerColorHex.replace("#", "")}` },
    };
    cell.font = {
      name: "Calibri",
      size: 11,
      bold: true,
      color: { argb: "FFFFFFFF" },
    };
    cell.alignment = {
      vertical: "middle",
      horizontal: "left",
      wrapText: false,
    };
    cell.border = {
      top: { style: "thin", color: { argb: "FF334155" } },
      bottom: { style: "medium", color: { argb: "FF0F172A" } },
      left: { style: "thin", color: { argb: "FF334155" } },
      right: { style: "thin", color: { argb: "FF334155" } },
    };
  });

  // 3. Format Data Rows (Alternating zebra colors & borders)
  const rowCount = worksheet.rowCount;
  for (let r = 2; r <= rowCount; r++) {
    const row = worksheet.getRow(r);
    row.height = 22;
    const isEven = r % 2 === 0;

    row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
      if (!cell.fill || cell.fill.type !== "pattern") {
        cell.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: isEven ? "FFF8FAFC" : "FFFFFFFF" },
        };
      }
      if (!cell.font) {
        cell.font = { name: "Calibri", size: 10, color: { argb: "FF1E293B" } };
      }
      if (!cell.alignment) {
        cell.alignment = { vertical: "middle", horizontal: "left" };
      }
      cell.border = {
        top: { style: "thin", color: { argb: "FFE2E8F0" } },
        bottom: { style: "thin", color: { argb: "FFE2E8F0" } },
        left: { style: "thin", color: { argb: "FFE2E8F0" } },
        right: { style: "thin", color: { argb: "FFE2E8F0" } },
      };
    });
  }

  // 4. Auto-fit column widths based on maximum content
  worksheet.columns.forEach((column) => {
    let maxLen = 0;
    if (column.header) {
      maxLen = String(column.header).length;
    }
    column.eachCell({ includeEmpty: false }, (cell) => {
      const val = cell.value !== undefined && cell.value !== null ? String(cell.value) : "";
      if (val.length > maxLen) {
        maxLen = val.length;
      }
    });
    column.width = Math.min(Math.max(maxLen + 4, 12), 48);
  });

  // 5. Add AutoFilter across all header columns
  if (worksheet.columns.length > 0 && rowCount >= 1) {
    const lastColIndex = worksheet.columns.length;
    worksheet.autoFilter = {
      from: { row: 1, column: 1 },
      to: { row: 1, column: lastColIndex },
    };
  }
};

/**
 * Robust date formatting utility for Excel cells to prevent Invalid Date exceptions
 */
export const formatSafeDate = (d, includeTime = true) => {
  if (!d) return "";
  try {
    const dateObj = new Date(d);
    if (isNaN(dateObj.getTime())) return "";
    const iso = dateObj.toISOString();
    return includeTime ? iso.replace("T", " ").slice(0, 19) : iso.slice(0, 10);
  } catch {
    return "";
  }
};

