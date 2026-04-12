import { Router } from "express";
import rateLimit from "express-rate-limit";
import { z } from "zod";

import { asyncHandler } from "../lib/http";
import { requireAuth } from "../middleware/auth";
import { getActiveSession } from "../services/sessions";
import { loginUser, logoutUser, refreshSession, registerUser } from "../services/auth";

const router = Router();

const loginLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many login attempts. Please try again in a minute." },
});

const registerSchema = z.object({
  name: z.string().min(2).max(100),
  email: z.string().email(),
  password: z.string().min(8).max(100),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(100),
});

const refreshSchema = z.object({
  refreshToken: z.string().min(1),
});

router.post(
  "/register",
  asyncHandler(async (req, res) => {
    const payload = registerSchema.parse(req.body);
    const result = await registerUser(payload);
    res.status(201).json(result);
  }),
);

router.post(
  "/login",
  loginLimiter,
  asyncHandler(async (req, res) => {
    const payload = loginSchema.parse(req.body);
    const result = await loginUser(payload);
    res.json(result);
  }),
);

router.post(
  "/refresh",
  asyncHandler(async (req, res) => {
    const payload = refreshSchema.parse(req.body);
    const result = await refreshSession(payload.refreshToken);
    res.json(result);
  }),
);

router.post(
  "/logout",
  asyncHandler(async (req, res) => {
    const payload = refreshSchema.parse(req.body);
    await logoutUser(payload.refreshToken);
    res.status(204).send();
  }),
);

router.get(
  "/me",
  requireAuth,
  asyncHandler(async (req, res) => {
    const activeSession = await getActiveSession(req.user!.id);

    res.json({
      user: req.user,
      activeSession: activeSession
        ? {
            id: activeSession.id,
            startedAt: activeSession.startedAt.toISOString(),
          }
        : null,
    });
  }),
);

export default router;
