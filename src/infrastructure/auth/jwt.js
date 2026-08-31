import jwt from "jsonwebtoken";
import { env } from "../../config/env.js";

export const signAccessToken = (payload, expiresIn = env.JWT.EXPIRES_IN) => {
  return jwt.sign(payload, env.JWT.SECRET, { expiresIn });
};

export const signRefreshToken = (payload, expiresIn = env.JWT.REFRESH_EXPIRES_IN) => {
  return jwt.sign(payload, env.JWT.REFRESH_SECRET, { expiresIn });
};

export const verifyAccessToken = (token) => {
  return jwt.verify(token, env.JWT.SECRET);
};

export const verifyRefreshToken = (token) => {
  return jwt.verify(token, env.JWT.REFRESH_SECRET);
};
