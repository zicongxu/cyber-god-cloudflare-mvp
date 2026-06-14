import { createConfessionPlan, createSettlementCopy } from "./agent";
import { newId, nowIso } from "./id";
import { fail, ok } from "./response";
import { assertTransition } from "./state-machine";
import { tinyTask } from "./templates";
import type { BehaviorDiagnosis, Env, FlowStatus, JudgementResult, RedemptionTaskTemplate, Reward } from "./types";

type FlowRow = {
  id: string;
  user_id: string;
  status: FlowStatus;
  confession_id: string | null;
  judgement_id: string | null;
  task_id: string | null;
};

type TaskRow = {
  id: string;
  user_id: string;
  confession_id: string;
  title: string;
  steps_json: string;
  duration_minutes: number;
  reward_wisdom: number;
  reward_discipline: number;
  reward_courage: number;
  reward_compassion: number;
  reward_exp: number;
  status: string;
};

type ProfileRow = {
  user_id: string;
  nickname: string;
  level: number;
  exp: number;
  wisdom: number;
  discipline: number;
  courage: number;
  compassion: number;
};

const LEVEL_EXP = 30;

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method === "OPTIONS") {
      return new Response(null, {
        headers: {
          "access-control-allow-origin": "*",
          "access-control-allow-methods": "GET,POST,OPTIONS",
          "access-control-allow-headers": "content-type,x-user-id",
        },
      });
    }

    const url = new URL(request.url);
    const path = url.pathname;

    try {
      if (request.method === "GET" && path === "/api/v1/health") {
        return ok({
          status: "ok",
          agent_provider: env.STEPFUN_API_KEY ? "stepfun" : "template",
          stepfun_model: env.STEPFUN_MODEL ?? "step-3.5-flash",
        });
      }

      if (request.method === "POST" && path === "/api/v1/confession-flows") {
        return await createConfessionFlow(request, env);
      }

      const flowMatch = path.match(/^\/api\/v1\/confession-flows\/([^/]+)$/);
      if (request.method === "GET" && flowMatch) {
        return await getConfessionFlow(env, request, flowMatch[1]);
      }

      const ritualMatch = path.match(/^\/api\/v1\/tasks\/([^/]+)\/completion-ritual$/);
      if (request.method === "POST" && ritualMatch) {
        return await startCompletionRitual(request, env, ritualMatch[1]);
      }

      const downgradeMatch = path.match(/^\/api\/v1\/tasks\/([^/]+)\/downgrade$/);
      if (request.method === "POST" && downgradeMatch) {
        return await downgradeTask(request, env, downgradeMatch[1]);
      }

      const selfConfirmMatch = path.match(/^\/api\/v1\/tasks\/([^/]+)\/self-confirm$/);
      if (request.method === "POST" && selfConfirmMatch) {
        return await selfConfirmTask(request, env, selfConfirmMatch[1]);
      }

      const settleMatch = path.match(/^\/api\/v1\/tasks\/([^/]+)\/settle$/);
      if (request.method === "POST" && settleMatch) {
        return await settleTask(request, env, settleMatch[1]);
      }

      if (request.method === "GET" && path === "/api/v1/users/me/profile") {
        return await getProfile(request, env);
      }

      return fail(40400, "not found", 404);
    } catch (error) {
      if (error instanceof ApiError) {
        return fail(error.code, error.message, error.status, error.data);
      }
      return fail(50000, "internal error", 500, {
        message: error instanceof Error ? error.message : "unknown error",
      });
    }
  },
};

class ApiError extends Error {
  constructor(
    readonly code: number,
    message: string,
    readonly status = 400,
    readonly data: unknown = {},
  ) {
    super(message);
  }
}

async function createConfessionFlow(request: Request, env: Env): Promise<Response> {
  const userId = requireUserId(request);
  const body = await readJson<{ content?: string; roast_level?: number }>(request);
  const content = body.content?.trim();
  if (!content) {
    throw new ApiError(40000, "content is required");
  }

  const roastLevel = clampRoastLevel(body.roast_level);
  const now = nowIso();
  await ensureProfile(env, userId, now);

  const diagnosis = diagnoseBehavior(content);
  const plan = await createConfessionPlan({ env, content, roastLevel, diagnosis });
  const { judgement, task } = plan;

  const flowId = newId("flow");
  const confessionId = newId("confession");
  const judgementId = newId("judgement");
  const taskId = newId("task");

  await env.DB.batch([
    env.DB.prepare(
      "INSERT INTO confession_flows (id, user_id, status, confession_id, judgement_id, task_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    ).bind(flowId, userId, "waiting_completion", confessionId, judgementId, taskId, now, now),
    env.DB.prepare(
      "INSERT INTO confessions (id, user_id, content, behavior_type, severity, created_at) VALUES (?, ?, ?, ?, ?, ?)",
    ).bind(confessionId, userId, content, diagnosis.behavior_type, diagnosis.severity, now),
    env.DB.prepare(
      "INSERT INTO judgements (id, user_id, confession_id, rap_text, sin_name, sentence_text, roast_level, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    ).bind(judgementId, userId, confessionId, judgement.rap_intro, judgement.sin_name, judgement.sentence, judgement.roast_level, now),
    insertTask(env, taskId, userId, confessionId, task, "waiting_completion", null, now),
  ]);

  return ok({
    flow_id: flowId,
    status: "waiting_completion",
    diagnosis: plan.diagnosis,
    judgement: formatJudgement(judgementId, judgement),
    task: formatTask(taskId, task, "waiting_completion"),
    agent: plan.agent_meta,
  });
}

async function getConfessionFlow(env: Env, request: Request, flowId: string): Promise<Response> {
  const userId = requireUserId(request);
  const flow = await getFlow(env, flowId, userId);
  if (!flow.confession_id || !flow.judgement_id || !flow.task_id) {
    throw new ApiError(40401, "flow not found", 404);
  }

  const confession = await env.DB.prepare("SELECT content, behavior_type FROM confessions WHERE id = ? AND user_id = ?")
    .bind(flow.confession_id, userId)
    .first<{ content: string; behavior_type: string }>();
  const judgement = await env.DB.prepare("SELECT rap_text, sin_name, sentence_text FROM judgements WHERE id = ? AND user_id = ?")
    .bind(flow.judgement_id, userId)
    .first<{ rap_text: string; sin_name: string; sentence_text: string }>();
  const task = await getTask(env, flow.task_id, userId);

  return ok({
    flow_id: flow.id,
    status: flow.status,
    confession: confession && {
      content: confession.content,
      behavior_type: confession.behavior_type,
    },
    judgement: judgement && {
      rap_intro: judgement.rap_text,
      sin_name: judgement.sin_name,
      sentence: judgement.sentence_text,
    },
    task: formatTaskRow(task),
  });
}

async function startCompletionRitual(request: Request, env: Env, taskId: string): Promise<Response> {
  const userId = requireUserId(request);
  const body = await readJson<{ flow_id?: string }>(request);
  const flow = await getFlow(env, requireString(body.flow_id, "flow_id"), userId);
  assertFlowTask(flow, taskId);
  assertStatus(flow.status, "waiting_completion");

  const nextStatus = assertTransition(flow.status, "start_completion_ritual");
  await updateFlowStatus(env, flow.id, userId, nextStatus);

  return ok({
    flow_id: flow.id,
    task_id: taskId,
    status: nextStatus,
    ritual: {
      title: "赛博上帝正在凝视你",
      content: "你不需要向我证明。但你心里知道，这一次，你有没有真的完成救赎。",
      options: [
        { value: "completed", label: "我诚实完成了" },
        { value: "not_completed", label: "我没有完成，请给我一个更小的救赎任务" },
      ],
    },
  });
}

async function downgradeTask(request: Request, env: Env, taskId: string): Promise<Response> {
  const userId = requireUserId(request);
  const body = await readJson<{ flow_id?: string }>(request);
  const flow = await getFlow(env, requireString(body.flow_id, "flow_id"), userId);
  assertFlowTask(flow, taskId);
  assertStatus(flow.status, "completion_ritual_started");

  const now = nowIso();
  const failedStatus = assertTransition(flow.status, "user_not_completed");
  const assignedStatus = assertTransition(assertTransition(failedStatus, "assign_tiny_task"), "task_assigned");
  const oldTask = await getTask(env, taskId, userId);
  const newTask = tinyTask();
  const newTaskId = newId("task");

  await env.DB.batch([
    env.DB.prepare("UPDATE redemption_tasks SET status = ? WHERE id = ? AND user_id = ?").bind("redemption_failed", taskId, userId),
    insertTask(env, newTaskId, userId, oldTask.confession_id, newTask, "waiting_completion", taskId, now),
    env.DB.prepare("UPDATE confession_flows SET status = ?, task_id = ?, updated_at = ? WHERE id = ? AND user_id = ?")
      .bind(assignedStatus, newTaskId, now, flow.id, userId),
  ]);

  return ok({
    flow_id: flow.id,
    previous_task_id: taskId,
    status: assignedStatus,
    message: "诚实，比伪装完成更接近救赎。",
    task: formatTask(newTaskId, newTask, "waiting_completion"),
  });
}

async function selfConfirmTask(request: Request, env: Env, taskId: string): Promise<Response> {
  const userId = requireUserId(request);
  const body = await readJson<{
    flow_id?: string;
    witness?: { witness_type?: string; content?: string };
    self_confirmation_text?: string;
  }>(request);
  const flow = await getFlow(env, requireString(body.flow_id, "flow_id"), userId);
  assertFlowTask(flow, taskId);
  assertStatus(flow.status, "completion_ritual_started");

  const confirmation = requireString(body.self_confirmation_text, "self_confirmation_text");
  const witnessId = newId("witness");
  const nextStatus = assertTransition(flow.status, "self_confirm_completion");
  const now = nowIso();

  await env.DB.batch([
    env.DB.prepare(
      "INSERT INTO redemption_witnesses (id, user_id, task_id, witness_type, content, file_key, self_confirmation_text, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    ).bind(witnessId, userId, taskId, body.witness?.witness_type ?? "text", body.witness?.content ?? null, null, confirmation, now),
    env.DB.prepare("UPDATE confession_flows SET status = ?, updated_at = ? WHERE id = ? AND user_id = ?")
      .bind(nextStatus, now, flow.id, userId),
  ]);

  return ok({
    flow_id: flow.id,
    task_id: taskId,
    status: nextStatus,
    witness_id: witnessId,
  });
}

async function settleTask(request: Request, env: Env, taskId: string): Promise<Response> {
  const userId = requireUserId(request);
  const body = await readJson<{ flow_id?: string }>(request);
  const flow = await getFlow(env, requireString(body.flow_id, "flow_id"), userId);
  assertFlowTask(flow, taskId);

  const existing = await env.DB.prepare("SELECT id FROM reward_events WHERE task_id = ? AND event_type = ?")
    .bind(taskId, "reward_settled")
    .first<{ id: string }>();
  if (existing) {
    return ok({
      flow_id: flow.id,
      task_id: taskId,
      status: flow.status,
      reward_event_id: existing.id,
      idempotent: true,
    }, "already settled");
  }

  assertStatus(flow.status, "self_confirmed");
  const task = await getTask(env, taskId, userId);
  const profile = await getProfileRow(env, userId);
  const reward = rewardFromTask(task);
  const before = { level: profile.level, exp: profile.exp };
  const totalExp = profile.exp + reward.exp;
  const levelGain = Math.floor(totalExp / LEVEL_EXP);
  const after = {
    level: profile.level + levelGain,
    exp: totalExp % LEVEL_EXP,
  };
  const levelUp = levelGain > 0;
  const finalStatus: FlowStatus = levelUp ? "oracle_unlocked" : "reward_settled";
  const rewardEventId = newId("reward");
  const now = nowIso();
  const confession = await env.DB.prepare("SELECT behavior_type FROM confessions WHERE id = ? AND user_id = ?")
    .bind(task.confession_id, userId)
    .first<{ behavior_type: string }>();
  const settlementCopy = await createSettlementCopy({
    env,
    behaviorType: confession?.behavior_type ?? "generic",
    taskTitle: task.title,
    levelUp,
  });
  const oracleText = settlementCopy.oracle_text;

  await env.DB.batch([
    env.DB.prepare(
      "UPDATE user_profiles SET level = ?, exp = ?, wisdom = wisdom + ?, discipline = discipline + ?, courage = courage + ?, compassion = compassion + ?, updated_at = ? WHERE user_id = ?",
    ).bind(after.level, after.exp, reward.wisdom, reward.discipline, reward.courage, reward.compassion, now, userId),
    env.DB.prepare("UPDATE redemption_tasks SET status = ?, completed_at = ? WHERE id = ? AND user_id = ?")
      .bind("completed", now, taskId, userId),
    env.DB.prepare(
      "INSERT INTO reward_events (id, user_id, task_id, event_type, reward_wisdom, reward_discipline, reward_courage, reward_compassion, reward_exp, before_level, after_level, before_exp, after_exp, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    ).bind(rewardEventId, userId, taskId, "reward_settled", reward.wisdom, reward.discipline, reward.courage, reward.compassion, reward.exp, before.level, after.level, before.exp, after.exp, now),
    ...(levelUp && oracleText
      ? [
          env.DB.prepare("INSERT INTO oracle_unlocks (id, user_id, flow_id, level, oracle_text, unlocked_at) VALUES (?, ?, ?, ?, ?, ?)")
            .bind(newId("oracle"), userId, flow.id, after.level, oracleText, now),
        ]
      : []),
    env.DB.prepare("UPDATE confession_flows SET status = ?, updated_at = ? WHERE id = ? AND user_id = ?")
      .bind(finalStatus, now, flow.id, userId),
  ]);

  return ok({
    flow_id: flow.id,
    task_id: taskId,
    status: finalStatus,
    settlement: {
      reward_event_id: rewardEventId,
      reward,
      before,
      after,
      level_up: levelUp,
    },
    oracle: {
      unlocked: levelUp,
      text: oracleText,
    },
    god_reply: settlementCopy.god_reply,
    agent: settlementCopy.agent_meta,
  });
}

async function getProfile(request: Request, env: Env): Promise<Response> {
  const userId = requireUserId(request);
  const now = nowIso();
  await ensureProfile(env, userId, now);
  const profile = await getProfileRow(env, userId);
  const completed = await env.DB.prepare("SELECT COUNT(*) AS count FROM redemption_tasks WHERE user_id = ? AND status = ?")
    .bind(userId, "completed")
    .first<{ count: number }>();
  const failed = await env.DB.prepare("SELECT COUNT(*) AS count FROM redemption_tasks WHERE user_id = ? AND status = ?")
    .bind(userId, "redemption_failed")
    .first<{ count: number }>();

  return ok({
    user_id: profile.user_id,
    nickname: profile.nickname,
    level: profile.level,
    exp: profile.exp,
    next_level_exp: LEVEL_EXP,
    attributes: {
      wisdom: profile.wisdom,
      discipline: profile.discipline,
      courage: profile.courage,
      compassion: profile.compassion,
    },
    stats: {
      completed_tasks: completed?.count ?? 0,
      failed_tasks: failed?.count ?? 0,
    },
  });
}

function diagnoseBehavior(content: string): BehaviorDiagnosis {
  if (matchAny(content, ["短视频", "抖音", "视频", "刷了"])) {
    return { behavior_type: "short_video_overuse", severity: "medium", main_barrier: "opportunity" };
  }
  if (matchAny(content, ["拖延", "没做", "明天", "计划"])) {
    return { behavior_type: "procrastination", severity: "medium", main_barrier: "motivation" };
  }
  if (matchAny(content, ["健身", "运动", "深蹲", "跑步"])) {
    return { behavior_type: "fitness_missing", severity: "medium", main_barrier: "motivation" };
  }
  if (matchAny(content, ["学习", "读书", "资料", "考试"])) {
    return { behavior_type: "study_avoidance", severity: "medium", main_barrier: "capability" };
  }
  if (matchAny(content, ["朋友", "社交", "消息", "回复"])) {
    return { behavior_type: "social_avoidance", severity: "low", main_barrier: "motivation" };
  }
  return { behavior_type: "generic", severity: "low", main_barrier: "motivation" };
}

function matchAny(content: string, keywords: string[]): boolean {
  return keywords.some((keyword) => content.includes(keyword));
}

async function readJson<T>(request: Request): Promise<T> {
  try {
    return (await request.json()) as T;
  } catch {
    throw new ApiError(40000, "invalid json");
  }
}

function requireUserId(request: Request): string {
  const userId = request.headers.get("x-user-id")?.trim();
  if (!userId) {
    throw new ApiError(40101, "missing user id", 401);
  }
  return userId;
}

function requireString(value: string | undefined, name: string): string {
  const normalized = value?.trim();
  if (!normalized) {
    throw new ApiError(40000, `${name} is required`);
  }
  return normalized;
}

function clampRoastLevel(value: number | undefined): number {
  if (!value || Number.isNaN(value)) return 3;
  return Math.max(1, Math.min(5, Math.floor(value)));
}

function assertStatus(actual: FlowStatus, expected: FlowStatus): void {
  if (actual !== expected) {
    throw new ApiError(40001, "invalid flow status", 400, { current_status: actual });
  }
}

function assertFlowTask(flow: FlowRow, taskId: string): void {
  if (flow.task_id !== taskId) {
    throw new ApiError(40000, "task does not belong to flow");
  }
}

async function ensureProfile(env: Env, userId: string, now: string): Promise<void> {
  await env.DB.prepare(
    "INSERT OR IGNORE INTO user_profiles (user_id, nickname, level, exp, wisdom, discipline, courage, compassion, created_at, updated_at) VALUES (?, ?, 1, 0, 0, 0, 0, 0, ?, ?)",
  ).bind(userId, "凡人", now, now).run();
}

async function getProfileRow(env: Env, userId: string): Promise<ProfileRow> {
  const profile = await env.DB.prepare("SELECT * FROM user_profiles WHERE user_id = ?").bind(userId).first<ProfileRow>();
  if (!profile) {
    throw new ApiError(40401, "profile not found", 404);
  }
  return profile;
}

async function getFlow(env: Env, flowId: string, userId: string): Promise<FlowRow> {
  const flow = await env.DB.prepare("SELECT * FROM confession_flows WHERE id = ? AND user_id = ?")
    .bind(flowId, userId)
    .first<FlowRow>();
  if (!flow) {
    throw new ApiError(40401, "flow not found", 404);
  }
  return flow;
}

async function getTask(env: Env, taskId: string, userId: string): Promise<TaskRow> {
  const task = await env.DB.prepare("SELECT * FROM redemption_tasks WHERE id = ? AND user_id = ?")
    .bind(taskId, userId)
    .first<TaskRow>();
  if (!task) {
    throw new ApiError(40402, "task not found", 404);
  }
  return task;
}

async function updateFlowStatus(env: Env, flowId: string, userId: string, status: FlowStatus): Promise<void> {
  await env.DB.prepare("UPDATE confession_flows SET status = ?, updated_at = ? WHERE id = ? AND user_id = ?")
    .bind(status, nowIso(), flowId, userId)
    .run();
}

function insertTask(
  env: Env,
  taskId: string,
  userId: string,
  confessionId: string,
  task: RedemptionTaskTemplate,
  status: string,
  parentTaskId: string | null,
  now: string,
): D1PreparedStatement {
  return env.DB.prepare(
    "INSERT INTO redemption_tasks (id, user_id, confession_id, title, steps_json, duration_minutes, reward_wisdom, reward_discipline, reward_courage, reward_compassion, reward_exp, verify_type, status, parent_task_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
  ).bind(
    taskId,
    userId,
    confessionId,
    task.title,
    JSON.stringify(task.steps),
    task.duration_minutes,
    task.reward.wisdom,
    task.reward.discipline,
    task.reward.courage,
    task.reward.compassion,
    task.reward.exp,
    "self_report",
    status,
    parentTaskId,
    now,
  );
}

function rewardFromTask(task: TaskRow): Reward {
  return {
    wisdom: task.reward_wisdom,
    discipline: task.reward_discipline,
    courage: task.reward_courage,
    compassion: task.reward_compassion,
    exp: task.reward_exp,
  };
}

function formatJudgement(judgementId: string, judgement: JudgementResult) {
  return {
    judgement_id: judgementId,
    rap_intro: judgement.rap_intro,
    sin_name: judgement.sin_name,
    sentence: judgement.sentence,
    roast_level: judgement.roast_level,
  };
}

function formatTask(taskId: string, task: RedemptionTaskTemplate, status: string) {
  return {
    task_id: taskId,
    title: task.title,
    steps: task.steps,
    duration_minutes: task.duration_minutes,
    reward: task.reward,
    status,
  };
}

function formatTaskRow(task: TaskRow) {
  return {
    task_id: task.id,
    title: task.title,
    steps: JSON.parse(task.steps_json) as string[],
    duration_minutes: task.duration_minutes,
    reward: rewardFromTask(task),
    status: task.status,
  };
}
