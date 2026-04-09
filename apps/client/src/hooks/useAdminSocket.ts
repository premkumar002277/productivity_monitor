import { startTransition, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { io } from "socket.io-client";

import { SOCKET_URL } from "../env";
import { useAuth } from "./useAuth";
import type {
  AlertFeedResponse,
  AlertItem,
  AlertType,
  BehaviorSnapshot,
  DashboardData,
  DashboardEmployee,
  EmotionSnapshot,
  ProductivityStatus,
} from "../types/api";

type LiveScoreUpdate = {
  userId: string;
  sessionId: string;
  score: number;
  status: ProductivityStatus;
  faceSeconds: number;
  activeSeconds: number;
  idleSeconds: number;
  totalSeconds: number;
  emotion: EmotionSnapshot;
  behavior: BehaviorSnapshot;
  isMonitoring: boolean;
  updatedAt: string;
};

type EmotionUpdate = {
  userId: string;
  dominant: EmotionSnapshot["dominant"];
  stressScore: number;
  engagementScore: number;
  boredomScore: number;
  scores: EmotionSnapshot["scores"];
  updatedAt: string;
};

type HeadPoseUpdate = {
  userId: string;
  lookingAway: boolean;
  lookingAwaySeconds: number;
  yaw: number;
  pitch: number;
  roll: number;
  updatedAt: string | null;
};

type BehaviorUpdate = {
  userId: string;
  erraticScore: number;
  rhythmScore: number;
  avgVelocityPx: number;
  clicksPerMin: number;
  idleSeconds: number;
  kpm: number;
  backspaceRate: number;
  burstDetected: boolean;
  updatedAt: string | null;
};

type AlertTriggeredUpdate = {
  id: string;
  userId: string;
  name: string;
  department: string | null;
  reason: string;
  alertType: AlertType;
  triggeredAt: string;
};

type AlertResolvedUpdate = {
  id: string;
  userId: string;
  alertType: AlertType;
};

function computeDepartmentAverages(employees: DashboardEmployee[]) {
  const map = new Map<
    string,
    {
      totalScore: number;
      employeeCount: number;
      activeEmployees: number;
    }
  >();

  employees.forEach((employee) => {
    const key = employee.department ?? "Unassigned";
    const current = map.get(key) ?? {
      totalScore: 0,
      employeeCount: 0,
      activeEmployees: 0,
    };

    current.totalScore += employee.score;
    current.employeeCount += 1;
    current.activeEmployees += employee.isMonitoring ? 1 : 0;
    map.set(key, current);
  });

  return Array.from(map.entries()).map(([department, value]) => ({
    department,
    averageScore: Math.round(value.totalScore / Math.max(1, value.employeeCount)),
    employeeCount: value.employeeCount,
    activeEmployees: value.activeEmployees,
  }));
}

function computeTeamSummary(employees: DashboardEmployee[]) {
  const activeEmployees = employees.filter((employee) => employee.isMonitoring);
  const openAlerts = employees.reduce((total, employee) => total + employee.alerts.length, 0);

  return {
    activeEmployees: activeEmployees.length,
    avgStress: Math.round(
      activeEmployees.reduce((total, employee) => total + employee.emotion.stressScore, 0) / Math.max(1, activeEmployees.length),
    ),
    avgEngagement: Math.round(
      activeEmployees.reduce((total, employee) => total + employee.emotion.engagementScore, 0) / Math.max(1, activeEmployees.length),
    ),
    openAlerts,
  };
}

function updateDashboardEmployees(
  current: DashboardData | undefined,
  updater: (employees: DashboardEmployee[]) => DashboardEmployee[],
) {
  if (!current) {
    return current;
  }

  const employees = updater(current.employees);

  return {
    ...current,
    employees,
    departmentAverages: computeDepartmentAverages(employees),
    teamSummary: computeTeamSummary(employees),
  };
}

function toAlertFeedItem(payload: AlertTriggeredUpdate): AlertItem {
  return {
    id: payload.id,
    reason: payload.reason,
    alertType: payload.alertType,
    resolved: false,
    triggeredAt: payload.triggeredAt,
    user: {
      id: payload.userId,
      name: payload.name,
      email: "",
      department: payload.department,
    },
  };
}

export function useAdminSocket(enabled: boolean) {
  const { tokens } = useAuth();
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!enabled || !tokens?.accessToken) {
      return;
    }

    const socket = io(SOCKET_URL, {
      transports: ["websocket"],
      auth: {
        token: tokens.accessToken,
      },
    });

    socket.on("score:update", (payload: LiveScoreUpdate) => {
      startTransition(() => {
        queryClient.setQueriesData({ queryKey: ["admin-dashboard"] }, (current: DashboardData | undefined) =>
          updateDashboardEmployees(current, (employees) =>
            employees.map((employee) =>
              employee.id === payload.userId
                ? {
                    ...employee,
                    sessionId: payload.sessionId,
                    score: payload.score,
                    status: payload.status,
                    faceSeconds: payload.faceSeconds,
                    activeSeconds: payload.activeSeconds,
                    idleSeconds: payload.idleSeconds,
                    emotion: payload.emotion,
                    behavior: payload.behavior,
                    isMonitoring: payload.isMonitoring,
                    updatedAt: payload.updatedAt,
                  }
                : employee,
            ),
          ),
        );
      });
    });

    socket.on("emotion:update", (payload: EmotionUpdate) => {
      startTransition(() => {
        queryClient.setQueriesData({ queryKey: ["admin-dashboard"] }, (current: DashboardData | undefined) =>
          updateDashboardEmployees(current, (employees) =>
            employees.map((employee) =>
              employee.id === payload.userId
                ? {
                    ...employee,
                    emotion: {
                      ...employee.emotion,
                      dominant: payload.dominant,
                      scores: payload.scores,
                      stressScore: payload.stressScore,
                      engagementScore: payload.engagementScore,
                      boredomScore: payload.boredomScore,
                      updatedAt: payload.updatedAt,
                    },
                  }
                : employee,
            ),
          ),
        );
      });
    });

    socket.on("headpose:update", (payload: HeadPoseUpdate) => {
      startTransition(() => {
        queryClient.setQueriesData({ queryKey: ["admin-dashboard"] }, (current: DashboardData | undefined) =>
          updateDashboardEmployees(current, (employees) =>
            employees.map((employee) =>
              employee.id === payload.userId
                ? {
                    ...employee,
                    behavior: {
                      ...employee.behavior,
                      lookingAway: payload.lookingAway,
                      lookingAwaySeconds: payload.lookingAwaySeconds,
                      yaw: payload.yaw,
                      pitch: payload.pitch,
                      roll: payload.roll,
                      updatedAt: payload.updatedAt,
                    },
                  }
                : employee,
            ),
          ),
        );
      });
    });

    socket.on("behavior:update", (payload: BehaviorUpdate) => {
      startTransition(() => {
        queryClient.setQueriesData({ queryKey: ["admin-dashboard"] }, (current: DashboardData | undefined) =>
          updateDashboardEmployees(current, (employees) =>
            employees.map((employee) =>
              employee.id === payload.userId
                ? {
                    ...employee,
                    behavior: {
                      ...employee.behavior,
                      erraticScore: payload.erraticScore,
                      rhythmScore: payload.rhythmScore,
                      avgVelocityPx: payload.avgVelocityPx,
                      clicksPerMin: payload.clicksPerMin,
                      idleSeconds: payload.idleSeconds,
                      kpm: payload.kpm,
                      backspaceRate: payload.backspaceRate,
                      burstDetected: payload.burstDetected,
                      updatedAt: payload.updatedAt,
                    },
                  }
                : employee,
            ),
          ),
        );
      });
    });

    socket.on("alert:triggered", (payload: AlertTriggeredUpdate) => {
      startTransition(() => {
        queryClient.setQueryData(["admin-alerts"], (current: AlertFeedResponse | undefined) => {
          if (!current) {
            return current;
          }

          return {
            ...current,
            alerts: [toAlertFeedItem(payload), ...current.alerts.filter((alert) => alert.id !== payload.id)],
          };
        });

        queryClient.setQueriesData({ queryKey: ["admin-dashboard"] }, (current: DashboardData | undefined) =>
          updateDashboardEmployees(current, (employees) =>
            employees.map((employee) =>
              employee.id === payload.userId
                ? {
                    ...employee,
                    alerts: [
                      {
                        id: payload.id,
                        reason: payload.reason,
                        alertType: payload.alertType,
                        triggeredAt: payload.triggeredAt,
                      },
                      ...employee.alerts.filter((alert) => alert.id !== payload.id),
                    ],
                  }
                : employee,
            ),
          ),
        );
      });
    });

    socket.on("alert:resolved", (payload: AlertResolvedUpdate) => {
      startTransition(() => {
        queryClient.setQueryData(["admin-alerts"], (current: AlertFeedResponse | undefined) => {
          if (!current) {
            return current;
          }

          return {
            ...current,
            alerts: current.alerts.map((alert) => (alert.id === payload.id ? { ...alert, resolved: true } : alert)),
          };
        });

        queryClient.setQueriesData({ queryKey: ["admin-dashboard"] }, (current: DashboardData | undefined) =>
          updateDashboardEmployees(current, (employees) =>
            employees.map((employee) =>
              employee.id === payload.userId
                ? {
                    ...employee,
                    alerts: employee.alerts.filter((alert) => alert.id !== payload.id),
                  }
                : employee,
            ),
          ),
        );
      });
    });

    return () => {
      socket.disconnect();
    };
  }, [enabled, queryClient, tokens?.accessToken]);
}
