import { EventType } from "@prisma/client";
import { Router } from "express";
import rateLimit from "express-rate-limit";
import { z } from "zod";

import { asyncHandler } from "../lib/http";
import { requireAuth } from "../middleware/auth";
import { persistEventBatch } from "../services/sessions";

const router = Router();

const eventLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 60,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.user?.id ?? req.ip,
  message: { message: "Too many event batches. Slow down and retry in a minute." },
});

const eventBatchSchema = z.object({
  sessionId: z.string().uuid(),
  events: z
    .array(
      z.object({
        type: z.nativeEnum(EventType),
        timestamp: z.coerce.date(),
        value: z.unknown().optional(),
      }),
    )
    .max(200),
});

router.post(
  "/",
  requireAuth,
  eventLimiter,
  asyncHandler(async (req, res) => {
    const payload = eventBatchSchema.parse(req.body);
    const result = await persistEventBatch(req.user!, payload.sessionId, payload.events);
    res.json(result);
  }),
);

export default router;
