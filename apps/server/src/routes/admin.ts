import { Role } from "@prisma/client";
import { Router } from "express";
import { z } from "zod";

import { AppError, asyncHandler } from "../lib/http";
import { requireAuth } from "../middleware/auth";
import { requireRole } from "../middleware/requireRole";
import { prisma } from "../lib/prisma";
import { getAlertSettings, updateAlertSettings } from "../services/alerts";
import { getEmployeeDashboard, getSessionTimeline } from "../services/dashboard";
import {
  exportEmotionReportCsv,
  exportSessionsCsv,
  getBehaviorTimeline,
  getDailyEmotionStats,
  getDailyStats,
  getEmotionTimeline,
} from "../services/reporter";

const router = Router();

router.use(requireAuth, requireRole(Role.ADMIN));

const employeesQuerySchema = z.object({
  department: z.string().min(1).optional(),
  search: z.string().min(1).optional(),
});

const timelineParamsSchema = z.object({
  sessionId: z.string().uuid(),
});

const employeeParamsSchema = z.object({
  employeeId: z.string().uuid(),
});

const dailyStatsQuerySchema = z.object({
  userId: z.string().uuid().optional(),
  days: z.coerce.number().int().min(1).max(30).default(7),
});

const timelineRangeQuerySchema = z.object({
  startDate: z.coerce.date().optional(),
  endDate: z.coerce.date().optional(),
});

const alertSettingsSchema = z.object({
  scoreThreshold: z.coerce.number().min(0).max(100),
  durationMinutes: z.coerce.number().int().min(1).max(120),
});

const exportQuerySchema = z.object({
  userId: z.string().uuid().optional(),
  from: z.string().optional(),
  to: z.string().optional(),
});

const emotionReportQuerySchema = z.object({
  date: z.coerce.date().optional(),
  department: z.string().min(1).optional(),
});

const resolveAlertParamsSchema = z.object({
  alertId: z.string().uuid(),
});

router.get(
  "/employees",
  asyncHandler(async (req, res) => {
    const query = employeesQuerySchema.parse(req.query);
    const dashboard = await getEmployeeDashboard(query);
    res.json(dashboard);
  }),
);

router.get(
  "/sessions/:sessionId/timeline",
  asyncHandler(async (req, res) => {
    const params = timelineParamsSchema.parse(req.params);
    const timeline = await getSessionTimeline(params.sessionId);

    if (!timeline) {
      throw new AppError(404, "Session not found");
    }

    res.json({ session: timeline });
  }),
);

router.get(
  "/employees/:employeeId/emotions",
  asyncHandler(async (req, res) => {
    const params = employeeParamsSchema.parse(req.params);
    const query = timelineRangeQuerySchema.parse(req.query);
    const timeline = await getEmotionTimeline(params.employeeId, query.startDate, query.endDate);
    res.json({ timeline });
  }),
);

router.get(
  "/employees/:employeeId/behavior",
  asyncHandler(async (req, res) => {
    const params = employeeParamsSchema.parse(req.params);
    const query = timelineRangeQuerySchema.parse(req.query);
    const timeline = await getBehaviorTimeline(params.employeeId, query.startDate, query.endDate);
    res.json({ timeline });
  }),
);

router.get(
  "/reports/daily",
  asyncHandler(async (req, res) => {
    const query = dailyStatsQuerySchema.parse(req.query);
    const stats = await getDailyStats(query.userId, query.days);
    res.json({ stats });
  }),
);

router.get(
  "/reports/emotions",
  asyncHandler(async (req, res) => {
    const query = emotionReportQuerySchema.parse(req.query);
    const stats = await getDailyEmotionStats({
      date: query.date,
      department: query.department,
    });
    res.json({ stats });
  }),
);

router.get(
  "/reports/export.csv",
  asyncHandler(async (req, res) => {
    const query = exportQuerySchema.parse(req.query);
    const csv = await exportSessionsCsv({
      userId: query.userId,
      from: query.from ? new Date(query.from) : undefined,
      to: query.to ? new Date(query.to) : undefined,
    });

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", "attachment; filename=workwatch-report.csv");
    res.send(csv);
  }),
);

router.get(
  "/reports/emotions/csv",
  asyncHandler(async (req, res) => {
    const query = emotionReportQuerySchema.parse(req.query);
    const csv = await exportEmotionReportCsv({
      date: query.date,
      department: query.department,
    });

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", "attachment; filename=workwatch-emotion-report.csv");
    res.send(csv);
  }),
);

router.get(
  "/alerts",
  asyncHandler(async (_req, res) => {
    const [alerts, settings] = await Promise.all([
      prisma.alert.findMany({
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
              department: true,
            },
          },
        },
        orderBy: {
          triggeredAt: "desc",
        },
        take: 25,
      }),
      getAlertSettings(),
    ]);

    res.json({
      settings,
      alerts: alerts.map((alert) => ({
        id: alert.id,
        reason: alert.reason,
        alertType: alert.alertType,
        resolved: alert.resolved,
        triggeredAt: alert.triggeredAt.toISOString(),
        user: alert.user,
      })),
    });
  }),
);

router.put(
  "/alerts/settings",
  asyncHandler(async (req, res) => {
    const payload = alertSettingsSchema.parse(req.body);
    const settings = await updateAlertSettings(payload);
    res.json({ settings });
  }),
);

router.post(
  "/alerts/:alertId/resolve",
  asyncHandler(async (req, res) => {
    const params = resolveAlertParamsSchema.parse(req.params);
    const existingAlert = await prisma.alert.findUnique({
      where: { id: params.alertId },
    });

    if (!existingAlert) {
      throw new AppError(404, "Alert not found");
    }

    const alert = await prisma.alert.update({
      where: { id: params.alertId },
      data: { resolved: true },
    });

    res.json({
      alert: {
        id: alert.id,
        resolved: alert.resolved,
      },
    });
  }),
);

export default router;
