import { startTransition, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { io } from "socket.io-client";

import { SOCKET_URL } from "../env";
import { useAuth } from "./useAuth";
import type { AlertFeedResponse, DashboardData, DashboardEmployee, ProductivityStatus } from "../types/api";

type LiveScoreUpdate = {
  userId: string;
  sessionId: string;
  score: number;
  status: ProductivityStatus;
  faceSeconds: number;
  activeSeconds: number;
  idleSeconds: number;
  totalSeconds: number;
  isMonitoring: boolean;
  updatedAt: string;
};

type AlertTriggeredUpdate = {
  id: string;
  userId: string;
  name: string;
  department: string | null;
  reason: string;
  triggeredAt: string;
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
        queryClient.setQueriesData({ queryKey: ["admin-dashboard"] }, (current: DashboardData | undefined) => {
          if (!current) {
            return current;
          }

          const employees = current.employees.map((employee) =>
            employee.id === payload.userId
              ? {
                  ...employee,
                  sessionId: payload.sessionId,
                  score: payload.score,
                  status: payload.status,
                  faceSeconds: payload.faceSeconds,
                  activeSeconds: payload.activeSeconds,
                  idleSeconds: payload.idleSeconds,
                  isMonitoring: payload.isMonitoring,
                  updatedAt: payload.updatedAt,
                }
              : employee,
          );

          return {
            ...current,
            employees,
            departmentAverages: computeDepartmentAverages(employees),
          };
        });
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
            alerts: [
              {
                id: payload.id,
                reason: payload.reason,
                resolved: false,
                triggeredAt: payload.triggeredAt,
                user: {
                  id: payload.userId,
                  name: payload.name,
                  email: "",
                  department: payload.department,
                },
              },
              ...current.alerts.filter((alert) => alert.id !== payload.id),
            ],
          };
        });

        queryClient.setQueriesData({ queryKey: ["admin-dashboard"] }, (current: DashboardData | undefined) => {
          if (!current) {
            return current;
          }

          return {
            ...current,
            employees: current.employees.map((employee) =>
              employee.id === payload.userId
                ? {
                    ...employee,
                    alert: {
                      id: payload.id,
                      reason: payload.reason,
                      triggeredAt: payload.triggeredAt,
                    },
                  }
                : employee,
            ),
          };
        });
      });
    });

    return () => {
      socket.disconnect();
    };
  }, [enabled, queryClient, tokens?.accessToken]);
}
