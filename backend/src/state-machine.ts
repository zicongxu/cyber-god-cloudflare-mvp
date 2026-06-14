import type { FlowStatus } from "./types";

type EventName =
  | "user_confess"
  | "judgement_created"
  | "task_assigned"
  | "start_completion_ritual"
  | "self_confirm_completion"
  | "settle_reward"
  | "unlock_oracle"
  | "user_not_completed"
  | "assign_tiny_task";

const transitions: Record<FlowStatus, Partial<Record<EventName, FlowStatus>>> = {
  idle: { user_confess: "confessed" },
  confessed: { judgement_created: "judged" },
  judged: { task_assigned: "waiting_completion" },
  waiting_completion: { start_completion_ritual: "completion_ritual_started" },
  completion_ritual_started: {
    self_confirm_completion: "self_confirmed",
    user_not_completed: "redemption_failed",
  },
  self_confirmed: { settle_reward: "reward_settled" },
  reward_settled: { unlock_oracle: "oracle_unlocked" },
  oracle_unlocked: {},
  redemption_failed: { assign_tiny_task: "downgraded_task_assigned" },
  downgraded_task_assigned: { task_assigned: "waiting_completion" },
};

export function assertTransition(from: FlowStatus, event: EventName): FlowStatus {
  const next = transitions[from]?.[event];
  if (!next) {
    throw new Error(`invalid transition: ${from} -> ${event}`);
  }
  return next;
}
