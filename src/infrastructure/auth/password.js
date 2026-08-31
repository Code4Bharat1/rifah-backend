import bcrypt from "bcryptjs";
import { env } from "../../config/env.js";

export const hashPassword = async (password) => {
  const salt = await bcrypt.genSalt(env.JWT.BCRYPT_SALT_ROUNDS);
  return bcrypt.hash(password, salt);
};

export const comparePassword = async (candidatePassword, hashedPassword) => {
  return bcrypt.compare(candidatePassword, hashedPassword);
};
