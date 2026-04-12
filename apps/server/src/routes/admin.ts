import { Role } from "@prisma/client";
import bcrypt from "bcrypt";
import { Router } from "express";
import { z } from "zod";

import { env } from "../config/env";
import { AppError, asyncHandler } from "../lib/http";
import { emitToAdmin } from "../lib/socket";
import { requireAuth } from "../middleware/auth";
import { requireRole } from "../middleware/requireRole";
import { prisma } from "../lib/prisma";
import { clearAlertBreach, getAlertSettings, updateAlertSettings } from "../services/alerts";
import { createEmployeeUser } from "../services/auth";
import { getEmployeeDashboard, getSessionTimeline } from "../services/dashboard";
import { deleteLiveScore } from "../services/liveScore";
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

const createEmployeeSchema = z.object({
  name: z.string().min(2).max(100),
  email: z.string().email(),
  password: z.string().min(8).max(100),
  department: z.string().min(1).max(100).nullable().optional(),
});

const resetPasswordSchema = z.object({
  newPassword: z.string().min(8).max(100),
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

async function getManagedEmployeeOrThrow(employeeId: string, adminId: string) {
  const employee = await prisma.user.findFirst({
    where: {
      id: employeeId,
      role: Role.EMPLOYEE,
      createdByAdminId: adminId,
    },
    select: {
      id: true,
      name: true,
      email: true,
      department: true,
      createdAt: true,
    },
  });

  if (!employee) {
    throw new AppError(404, "Employee not found");
  }

  return employee;
}

router.get(
  "/employees",
  asyncHandler(async (req, res) => {
    const query = employeesQuerySchema.parse(req.query);
    const dashboard = await getEmployeeDashboard(req.user!.id, query);
    res.json(dashboard);
  }),
);

router.post(
  "/employees/create",
  asyncHandler(async (req, res) => {
    const payload = createEmployeeSchema.parse(req.body);
    const employee = await createEmployeeUser(req.user!.id, payload);

    res.status(201).json({
      employee: {
        id: employee.id,
        name: employee.name,
        email: employee.email,
        department: employee.department,
        createdAt: employee.createdAt.toISOString(),
      },
    });
  }),
);

router.get(
  "/sessions/:sessionId/timeline",
  asyncHandler(async (req, res) => {
    const params = timelineParamsSchema.parse(req.params);
    const timeline = await getSessionTimeline(params.sessionId, req.user!.id);

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
    await getManagedEmployeeOrThrow(params.employeeId, req.user!.id);
    const timeline = await getEmotionTimeline(req.user!.id, params.employeeId, query.startDate, query.endDate);
    res.json({ timeline });
  }),
);

router.get(
  "/employees/:employeeId/behavior",
  asyncHandler(async (req, res) => {
    const params = employeeParamsSchema.parse(req.params);
    const query = timelineRangeQuerySchema.parse(req.query);
    await getManagedEmployeeOrThrow(params.employeeId, req.user!.id);
    const timeline = await getBehaviorTimeline(req.user!.id, params.employeeId, query.startDate, query.endDate);
    res.json({ timeline });
  }),
);

router.patch(
  "/employees/:employeeId/reset-password",
  asyncHandler(async (req, res) => {
    const params = employeeParamsSchema.parse(req.params);
    const payload = resetPasswordSchema.parse(req.body);
    const employee = await getManagedEmployeeOrThrow(params.employeeId, req.user!.id);
    const passwordHash = await bcrypt.hash(payload.newPassword, env.BCRYPT_ROUNDS);

    await prisma.user.update({
      where: { id: employee.id },
      data: { passwordHash },
    });

    res.json({
      employee: {
        id: employee.id,
        name: employee.name,
      },
    });
  }),
);

router.delete(
  "/employees/:employeeId",
  asyncHandler(async (req, res) => {
    const params = employeeParamsSchema.parse(req.params);
    const employee = await getManagedEmployeeOrThrow(params.employeeId, req.user!.id);
    const sessions = await prisma.session.findMany({
      where: { userId: employee.id },
      select: { id: true },
    });
    const sessionIds = sessions.map((session) => session.id);

    await prisma.$transaction(async (tx) => {
      if (sessionIds.length > 0) {
        await tx.event.deleteMany({
          where: {
            sessionId: { in: sessionIds },
          },
        });
        await tx.emotionSample.deleteMany({
          where: {
            sessionId: { in: sessionIds },
          },
        });
        await tx.headPoseSample.deleteMany({
          where: {
            sessionId: { in: sessionIds },
          },
        });
        await tx.behaviorSample.deleteMany({
          where: {
            sessionId: { in: sessionIds },
          },
        });
      }

      await tx.alert.deleteMany({
        where: { userId: employee.id },
      });
      await tx.dailyEmotionStat.deleteMany({
        where: { userId: employee.id },
      });
      await tx.dailyStat.deleteMany({
        where: { userId: employee.id },
      });
      await tx.session.deleteMany({
        where: { userId: employee.id },
      });
      await tx.user.delete({
        where: { id: employee.id },
      });
    });

    await Promise.all([deleteLiveScore(employee.id), clearAlertBreach(employee.id)]);

    res.json({
      deletedEmployee: {
        id: employee.id,
        name: employee.name,
      },
    });
  }),
);

router.get(
  "/reports/daily",
  asyncHandler(async (req, res) => {
    const query = dailyStatsQuerySchema.parse(req.query);
    const stats = await getDailyStats(req.user!.id, query.userId, query.days);
    res.json({ stats });
  }),
);

router.get(
  "/reports/emotions",
  asyncHandler(async (req, res) => {
    const query = emotionReportQuerySchema.parse(req.query);
    const stats = await getDailyEmotionStats(req.user!.id, {
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
    const csv = await exportSessionsCsv(req.user!.id, {
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
    const csv = await exportEmotionReportCsv(req.user!.id, {
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
  asyncHandler(async (req, res) => {
    const [alerts, settings] = await Promise.all([
      prisma.alert.findMany({
        where: {
          user: {
            createdByAdminId: req.user!.id,
            role: Role.EMPLOYEE,
          },
        },
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
    const existingAlert = await prisma.alert.findFirst({
      where: {
        id: params.alertId,
        user: {
          createdByAdminId: req.user!.id,
          role: Role.EMPLOYEE,
        },
      },
      select: {
        id: true,
        userId: true,
        alertType: true,
        resolved: true,
      },
    });

    if (!existingAlert) {
      throw new AppError(404, "Alert not found");
    }

    const alert = existingAlert.resolved
      ? existingAlert
      : await prisma.alert.update({
          where: { id: params.alertId },
          data: { resolved: true },
          select: {
            id: true,
            userId: true,
            alertType: true,
            resolved: true,
          },
        });

    if (!existingAlert.resolved) {
      emitToAdmin(req.user!.id, "alert:resolved", {
        id: alert.id,
        userId: alert.userId,
        alertType: alert.alertType,
      });
    }

    res.json({
      alert: {
        id: alert.id,
        resolved: alert.resolved,
      },
    });
  }),
);

export default router;
