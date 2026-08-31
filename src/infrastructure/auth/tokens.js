import crypto from "crypto";

export const generateResetToken = () => {
  const rawToken = crypto.randomBytes(32).toString("hex");
  const hashedToken = crypto.createHash("sha256").update(rawToken).digest("hex");
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes
  return { rawToken, hashedToken, expiresAt };
};

export const hashToken = (token) => {
  return crypto.createHash("sha256").update(token).digest("hex");
};
