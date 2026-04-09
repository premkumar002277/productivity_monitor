import type { RequestHandler } from "express";

import { AppError } from "../lib/http";
import { verifyAccessToken } from "../services/jwt";

export const requireAuth: RequestHandler = (req, _res, next) => {
  const authorization = req.headers.authorization;

  if (!authorization?.startsWith("Bearer ")) {
    return next(new AppError(401, "Missing bearer token"));
  }

  try {
    const token = authorization.slice("Bearer ".length);
    const payload = verifyAccessToken(token);

    req.user = {
      id: payload.sub,
      email: payload.email,
      name: payload.name,
      role: payload.role,
      department: payload.department,
    };

    return next();
  } catch (error) {
    return next(new AppError(401, "Invalid or expired access token", error));
  }
};
