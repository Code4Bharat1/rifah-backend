import crypto from "crypto";

export const generateReferenceId = (prefix = "REF", digits = 4) => {
  const min = Math.pow(10, digits - 1);
  const max = Math.pow(10, digits) - 1;
  const num = Math.floor(min + Math.random() * (max - min + 1));
  return `${prefix}-${num}`;
};

export const generateSlug = (text = "") => {
  return text
    .toString()
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^\w\-]+/g, "")
    .replace(/\-\-+/g, "-")
    .replace(/^-+/, "")
    .replace(/-+$/, "");
};

export const generateRandomToken = (bytes = 32) => {
  return crypto.randomBytes(bytes).toString("hex");
};
