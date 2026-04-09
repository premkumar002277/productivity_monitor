export type UserRole = "ADMIN" | "EMPLOYEE";
export type ProductivityStatus = "active" | "idle" | "low" | "away";
export type EmotionName = "happy" | "sad" | "angry" | "fearful" | "disgusted" | "surprised" | "neutral";
export type AlertType = "low_score" | "high_stress" | "head_away" | "erratic_behavior" | "low_engagement";
export type MonitoringEventType =
  | "FACE_DETECTED"
  | "FACE_LOST"
  | "TAB_BLUR"
  | "TAB_FOCUS"
  | "IDLE_START"
  | "IDLE_END"
  | "EMOTION_SAMPLE"
  | "HEAD_POSE_SAMPLE"
  | "MOUSE_BEHAVIOR"
  | "KEYBOARD_BEHAVIOR";

export interface EmotionScores {
  neutral: number;
  happy: number;
  sad: number;
  angry: number;
  fearful: number;
  disgusted: number;
  surprised: number;
}

export interface EmotionSampleValue {
  dominant: EmotionName;
  scores: EmotionScores;
}

export interface HeadPoseSampleValue {
  yaw: number;
  pitch: number;
  roll: number;
  lookingAway: boolean;
}

export interface MouseBehaviorValue {
  avgVelocityPx: number;
  clicksPerMin: number;
  erraticScore: number;
  idleSeconds: number;
}

export interface KeyboardBehaviorValue {
  kpm: number;
  rhythmScore: number;
  backspaceRate: number;
  burstDetected: boolean;
}

export interface EmotionSnapshot {
  dominant: EmotionName | null;
  scores: EmotionScores;
  stressScore: number;
  engagementScore: number;
  boredomScore: number;
  updatedAt: string | null;
}

export interface BehaviorSnapshot {
  yaw: number;
  pitch: number;
  roll: number;
  lookingAway: boolean;
  lookingAwaySeconds: number;
  headAwayRatio: number;
  avgVelocityPx: number;
  clicksPerMin: number;
  erraticScore: number;
  idleSeconds: number;
  kpm: number;
  rhythmScore: number;
  backspaceRate: number;
  burstDetected: boolean;
  updatedAt: string | null;
}

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
  emotion: EmotionSnapshot;
  behavior: BehaviorSnapshot;
}

export interface EventBatchResult {
  sessionId: string;
  metrics: SessionMetrics;
}

export interface DashboardAlert {
  id: string;
  reason: string;
  alertType: AlertType;
  triggeredAt: string;
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
  emotion: EmotionSnapshot;
  behavior: BehaviorSnapshot;
  alerts: DashboardAlert[];
}

export interface DepartmentAverage {
  department: string;
  averageScore: number;
  employeeCount: number;
  activeEmployees: number;
}

export interface TeamSummary {
  activeEmployees: number;
  avgStress: number;
  avgEngagement: number;
  openAlerts: number;
}

export interface AlertSettings {
  scoreThreshold: number;
  durationMinutes: number;
}

export interface DashboardData {
  employees: DashboardEmployee[];
  departmentAverages: DepartmentAverage[];
  teamSummary: TeamSummary;
  settings: AlertSettings;
}

export interface AlertItem {
  id: string;
  reason: string;
  alertType: AlertType;
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

export interface DailyEmotionStat {
  id: string;
  userId: string;
  date: string;
  avgStress: number;
  avgEngagement: number;
  avgBoredom: number;
  dominantEmotion: EmotionName;
  avgHeadAwayPct: number;
  avgTypingRhythm: number;
  avgErratic: number;
  user: {
    id: string;
    name: string;
    email: string;
    department: string | null;
  };
}

export interface EmotionTimelinePoint {
  timestamp: string;
  dominant: EmotionName;
  stressScore: number;
  engagementScore: number;
  boredomScore: number;
}

export interface BehaviorTimelinePoint {
  timestamp: string;
  yaw: number;
  pitch: number;
  roll: number;
  lookingAway: boolean;
  avgVelocityPx: number;
  clicksPerMin: number;
  erraticScore: number;
  idleSeconds: number;
  kpm: number;
  rhythmScore: number;
  backspaceRate: number;
  burstDetected: boolean;
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
