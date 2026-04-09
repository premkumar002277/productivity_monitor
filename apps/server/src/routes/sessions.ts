import { Router } from "express";
import { z } from "zod";

import { AppError, asyncHandler } from "../lib/http";
import { requireAuth } from "../middleware/auth";
import { getActiveSession, getSessionForUser, startSession, stopSession } from "../services/sessions";

const router = Router();

const startSchema = z.object({
  consentAccepted: z.literal(true),
});

const sessionParamsSchema = z.object({
  sessionId: z.string().uuid(),
});

router.use(requireAuth);

router.post(
  "/start",
  asyncHandler(async (req, res) => {
    startSchema.parse(req.body);
    const session = await startSession(req.user!);

    res.status(201).json({
      id: session.id,
      startedAt: session.startedAt.toISOString(),
      endedAt: session.endedAt?.toISOString() ?? null,
      finalScore: session.finalScore,
    });
  }),
);

router.get(
  "/active",
  asyncHandler(async (req, res) => {
    const session = await getActiveSession(req.user!.id);

    res.json({
      session: session
        ? {
            id: session.id,
            startedAt: session.startedAt.toISOString(),
            endedAt: session.endedAt?.toISOString() ?? null,
            finalScore: session.finalScore,
            faceSeconds: session.faceSeconds,
            activeSeconds: session.activeSeconds,
            idleSeconds: session.idleSeconds,
          }
        : null,
    });
  }),
);

router.get(
  "/:sessionId",
  asyncHandler(async (req, res) => {
    const params = sessionParamsSchema.parse(req.params);
    const session = await getSessionForUser(params.sessionId, req.user!);
    res.json({ session });
  }),
);

router.post(
  "/:sessionId/stop",
  asyncHandler(async (req, res) => {
    const params = sessionParamsSchema.parse(req.params);

    if (!req.user) {
      throw new AppError(401, "Authentication required");
    }

    const session = await stopSession(req.user, params.sessionId);
    res.json({ session });
  }),
);

export default router;
