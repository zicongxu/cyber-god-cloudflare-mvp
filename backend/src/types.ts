export interface Env {
  DB: D1Database;
}

export type FlowStatus =
  | "idle"
  | "confessed"
  | "judged"
  | "waiting_completion"
  | "completion_ritual_started"
  | "self_confirmed"
  | "reward_settled"
  | "oracle_unlocked"
  | "redemption_failed"
  | "downgraded_task_assigned";

export interface Reward {
  wisdom: number;
  discipline: number;
  courage: number;
  compassion: number;
  exp: number;
}

export interface BehaviorDiagnosis {
  behavior_type: string;
  severity: "low" | "medium" | "high";
  main_barrier: "capability" | "opportunity" | "motivation";
}

export interface JudgementResult {
  rap_intro: string;
  sin_name: string;
  sentence: string;
  roast_level: number;
}

export interface RedemptionTaskTemplate {
  title: string;
  steps: string[];
  duration_minutes: number;
  reward: Reward;
}
