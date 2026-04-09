import type { Role } from "@prisma/client";
import type { RequestHandler } from "express";

import { AppError } from "../lib/http";

export function requireRole(role: Role): RequestHandler {
  return (req, _res, next) => {
    if (!req.user) {
      return next(new AppError(401, "Authentication required"));
    }

    if (req.user.role !== role) {
      return next(new AppError(403, "You do not have access to this resource"));
    }

    return next();
  };
}
