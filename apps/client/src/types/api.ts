export type UserRole = "ADMIN" | "EMPLOYEE";
export type ProductivityStatus = "active" | "idle" | "away";
export type MonitoringEventType =
  | "FACE_DETECTED"
  | "FACE_LOST"
  | "TAB_BLUR"
  | "TAB_FOCUS"
  | "IDLE_START"
  | "IDLE_END";

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  department: string | null;
  createdAt?: string;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export interface AuthResponse {
  user: AuthUser;
  tokens: AuthTokens;
}

export interface SessionSummary {
  id: string;
  startedAt: string;
  endedAt: string | null;
  finalScore: number | null;
  faceSeconds: number;
  activeSeconds: number;
  idleSeconds: number;
}

export interface MonitoringEvent {
  id: string;
  type: MonitoringEventType;
  timestamp: string;
  value?: unknown;
}

export interface SessionDetails extends SessionSummary {
  userId: string;
  events: MonitoringEvent[];
}

export interface SessionMetrics {
  totalSeconds: number;
  faceSeconds: number;
  idleSeconds: number;
  activeSeconds: number;
  nonIdleSeconds: number;
  score: number;
  status: ProductivityStatus;
}

export interface EventBatchResult {
  sessionId: string;
  metrics: SessionMetrics;
}

export interface DashboardEmployee {
  id: string;
  name: string;
  email: string;
  department: string | null;
  isMonitoring: boolean;
  sessionId: string | null;
  startedAt: string | null;
  updatedAt: string | null;
  score: number;
  status: ProductivityStatus;
  faceSeconds: number;
  activeSeconds: number;
  idleSeconds: number;
  alert: {
    id: string;
    reason: string;
    triggeredAt: string;
  } | null;
}

export interface DepartmentAverage {
  department: string;
  averageScore: number;
  employeeCount: number;
  activeEmployees: number;
}

export interface AlertSettings {
  scoreThreshold: number;
  durationMinutes: number;
}

export interface DashboardData {
  employees: DashboardEmployee[];
  departmentAverages: DepartmentAverage[];
  settings: AlertSettings;
}

export interface AlertItem {
  id: string;
  reason: string;
  resolved: boolean;
  triggeredAt: string;
  user: {
    id: string;
    name: string;
    email: string;
    department: string | null;
  };
}

export interface AlertFeedResponse {
  settings: AlertSettings;
  alerts: AlertItem[];
}

export interface DailyStat {
  id: string;
  userId: string;
  date: string;
  avgScore: number;
  totalFaceSeconds: number;
  totalIdleSeconds: number;
  sessionCount: number;
  user: {
    id: string;
    name: string;
    email: string;
    department: string | null;
  };
}

export interface TimelineSession {
  id: string;
  userId: string;
  startedAt: string;
  endedAt: string | null;
  finalScore: number | null;
  faceSeconds: number;
  activeSeconds: number;
  idleSeconds: number;
  user: {
    id: string;
    name: string;
    email: string;
    department: string | null;
  };
  events: MonitoringEvent[];
}
