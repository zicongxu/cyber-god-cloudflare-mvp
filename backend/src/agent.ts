import { judgementFor, oracleFor, taskFor } from "./templates";
import type { AgentMeta, BehaviorDiagnosis, ConfessionPlan, Env, RedemptionTaskTemplate, Reward, SettlementCopy } from "./types";

const DEFAULT_STEPFUN_MODEL = "step-3.7-flash";
const DEFAULT_STEPFUN_BASE_URL = "https://api.stepfun.com/step_plan/v1";
const DEFAULT_REASONING_EFFORT = "low";

export type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export async function createConfessionPlan(params: {
  env: Env;
  content: string;
  roastLevel: number;
  diagnosis: BehaviorDiagnosis;
}): Promise<ConfessionPlan> {
  const fallbackPlan = createTemplatePlan(params.content, params.roastLevel, params.diagnosis);

  if (!params.env.STEPFUN_API_KEY) {
    return fallbackPlan;
  }

  try {
    const generated = await chatJson<{
      judgement?: {
        rap_intro?: string;
        sin_name?: string;
        sentence?: string;
      };
      task?: {
        title?: string;
        steps?: string[];
        duration_minutes?: number;
        reward?: Partial<RedemptionTaskTemplate["reward"]>;
      };
    }>(params.env, [
      {
        role: "system",
        content: [
          "你是赛博上帝的后端 Agent 文案生成器。",
          "只输出 JSON，不要输出 Markdown。",
          "你负责基于用户忏悔生成幽默审判和可执行救赎任务。",
          "审判行为，不羞辱人格；吐槽选择，不攻击身份。",
          "任务必须 5 到 20 分钟，可执行、明确、可自我确认。",
          "奖励字段必须包含 wisdom、discipline、courage、compassion、exp，数值为整数。",
          "最终答案必须放在 assistant.content 中，不能只放在 reasoning 中。",
        ].join("\n"),
      },
      {
        role: "user",
        content: JSON.stringify({
          confession: params.content,
          roast_level: params.roastLevel,
          diagnosis: params.diagnosis,
          required_schema: {
            judgement: {
              rap_intro: "两到四句 Rap 式吐槽",
              sin_name: "荒诞但无害的罪名",
              sentence: "荒诞但无害的判决",
            },
            task: {
              title: "救赎任务标题",
              steps: ["步骤 1", "步骤 2", "步骤 3"],
              duration_minutes: 15,
              reward: { wisdom: 0, discipline: 0, courage: 0, compassion: 0, exp: 10 },
            },
          },
        }),
      },
    ]);

    const agentMeta = stepfunMeta(params.env, false);
    return {
      diagnosis: params.diagnosis,
      judgement: {
        rap_intro: normalizeString(generated.judgement?.rap_intro, fallbackPlan.judgement.rap_intro),
        sin_name: normalizeString(generated.judgement?.sin_name, fallbackPlan.judgement.sin_name),
        sentence: normalizeString(generated.judgement?.sentence, fallbackPlan.judgement.sentence),
        roast_level: params.roastLevel,
      },
      task: normalizeTask(generated.task, fallbackPlan.task),
      agent_meta: agentMeta,
    };
  } catch (error) {
    return withFallbackMeta(fallbackPlan, params.env, error);
  }
}

export async function createSettlementCopy(params: {
  env: Env;
  behaviorType: string;
  taskTitle: string;
  levelUp: boolean;
}): Promise<SettlementCopy> {
  const fallback: SettlementCopy = {
    god_reply: "救赎已被见证。今天你没有继续向算法进贡，也没有把承诺扔进明天的垃圾桶。",
    oracle_text: params.levelUp ? oracleFor(params.behaviorType) : null,
    agent_meta: templateMeta(),
  };

  if (!params.env.STEPFUN_API_KEY) {
    return fallback;
  }

  try {
    const generated = await chatJson<{ god_reply?: string; oracle_text?: string | null }>(params.env, [
      {
        role: "system",
        content: [
          "你是赛博上帝的完成结算文案生成器。",
          "只输出 JSON，不要输出 Markdown。",
          "文风幽默、审判感、嘴硬认可，但不能羞辱人格。",
          "god_reply 不超过 120 个中文字符。",
          "如果没有升级，oracle_text 必须为 null。",
          "如果升级，oracle_text 为 1 到 3 句扎心但不鸡汤的神谕。",
          "最终答案必须放在 assistant.content 中，不能只放在 reasoning 中。",
        ].join("\n"),
      },
      {
        role: "user",
        content: JSON.stringify({
          behavior_type: params.behaviorType,
          completed_task: params.taskTitle,
          level_up: params.levelUp,
        }),
      },
    ]);

    return {
      god_reply: normalizeString(generated.god_reply, fallback.god_reply),
      oracle_text: params.levelUp ? normalizeString(generated.oracle_text ?? undefined, fallback.oracle_text ?? oracleFor(params.behaviorType)) : null,
      agent_meta: stepfunMeta(params.env, false),
    };
  } catch (error) {
    return {
      ...fallback,
      agent_meta: stepfunMeta(params.env, true, error),
    };
  }
}

function createTemplatePlan(content: string, roastLevel: number, diagnosis: BehaviorDiagnosis): ConfessionPlan {
  return {
    diagnosis,
    judgement: judgementFor(diagnosis.behavior_type, roastLevel),
    task: taskFor(diagnosis.behavior_type),
    agent_meta: templateMeta(),
  };
}

function withFallbackMeta(plan: ConfessionPlan, env: Env, error: unknown): ConfessionPlan {
  return {
    ...plan,
    agent_meta: stepfunMeta(env, true, error),
  };
}

export async function chatWithStepFun(env: Env, messages: ChatMessage[]): Promise<{ content: string; meta: AgentMeta }> {
  if (!env.STEPFUN_API_KEY) {
    throw new Error("STEPFUN_API_KEY is not configured");
  }

  const payload = await requestStepFun(env, messages, false);
  const content = extractStepFunContent(payload);
  if (!content) {
    throw new Error(`StepFun response missing content: ${truncate(JSON.stringify(payload), 240)}`);
  }

  return {
    content,
    meta: stepfunMeta(env, false),
  };
}

export async function streamStepFunChat(env: Env, messages: ChatMessage[]): Promise<Response> {
  if (!env.STEPFUN_API_KEY) {
    throw new Error("STEPFUN_API_KEY is not configured");
  }

  const response = await fetchStepFunOnce(env, messages, true);

  if (!response.ok || !response.body) {
    const errorText = await response.text();
    throw new Error(`StepFun stream request failed: ${response.status} ${truncate(errorText, 160)}`);
  }

  return new Response(response.body, {
    status: response.status,
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache",
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "GET,POST,OPTIONS",
      "access-control-allow-headers": "content-type,x-user-id",
    },
  });
}

async function chatJson<T>(env: Env, messages: ChatMessage[]): Promise<T> {
  const payload = await requestStepFun(env, messages, false);
  const content = extractStepFunContent(payload);
  if (!content) {
    throw new Error(`StepFun response missing content: ${truncate(JSON.stringify(payload), 240)}`);
  }

  const jsonText = extractJsonText(content);
  if (!jsonText) {
    throw new Error(`StepFun response does not contain JSON: ${truncate(content, 160)}`);
  }

  try {
    return JSON.parse(jsonText) as T;
  } catch {
    throw new Error(`StepFun response is not valid JSON: ${truncate(content, 160)}`);
  }
}

async function requestStepFun(env: Env, messages: ChatMessage[], stream: boolean): Promise<{
  choices?: Array<{ message?: { content?: unknown; reasoning_content?: unknown; reasoning?: unknown } }>;
  output_text?: unknown;
}> {
  const response = await fetchStepFunOnce(env, messages, stream);

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`StepFun request failed: ${response.status} ${truncate(errorText, 160)}`);
  }

  return response.json<{
    choices?: Array<{ message?: { content?: unknown; reasoning_content?: unknown; reasoning?: unknown } }>;
    output_text?: unknown;
  }>();
}

function fetchStepFunOnce(env: Env, messages: ChatMessage[], stream: boolean): Promise<Response> {
  const baseUrl = env.STEPFUN_BASE_URL ?? DEFAULT_STEPFUN_BASE_URL;
  const model = env.STEPFUN_MODEL ?? DEFAULT_STEPFUN_MODEL;
  return fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${env.STEPFUN_API_KEY}`,
    },
    body: JSON.stringify({
      model,
      messages,
      temperature: 0.7,
      top_p: 0.9,
      max_tokens: 800,
      stream,
      reasoning_effort: env.STEPFUN_REASONING_EFFORT ?? DEFAULT_REASONING_EFFORT,
    }),
  });
}

function extractStepFunContent(payload: {
  choices?: Array<{ message?: { content?: unknown; reasoning_content?: unknown; reasoning?: unknown } }>;
  output_text?: unknown;
}): string | null {
  const message = payload.choices?.[0]?.message;
  return firstNonEmptyText(message?.content, payload.output_text);
}

function normalizeTask(value: unknown, fallback: RedemptionTaskTemplate): RedemptionTaskTemplate {
  const task = value as Partial<RedemptionTaskTemplate> | undefined;
  const reward = (task?.reward ?? {}) as Partial<Reward>;
  return {
    title: normalizeString(task?.title, fallback.title),
    steps: Array.isArray(task?.steps) && task.steps.length > 0
      ? task.steps.map((step) => String(step)).slice(0, 5)
      : fallback.steps,
    duration_minutes: normalizeNumber(task?.duration_minutes, fallback.duration_minutes, 3, 20),
    reward: {
      wisdom: normalizeNumber(reward.wisdom, fallback.reward.wisdom, 0, 5),
      discipline: normalizeNumber(reward.discipline, fallback.reward.discipline, 0, 5),
      courage: normalizeNumber(reward.courage, fallback.reward.courage, 0, 5),
      compassion: normalizeNumber(reward.compassion, fallback.reward.compassion, 0, 5),
      exp: normalizeNumber(reward.exp, fallback.reward.exp, 1, 30),
    },
  };
}

function normalizeString(value: string | null | undefined, fallback: string): string {
  const normalized = value?.trim();
  return normalized ? normalized : fallback;
}

function normalizeNumber(value: unknown, fallback: number, min: number, max: number): number {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, Math.round(parsed)));
}

function stepfunMeta(env: Env, fallback: boolean, error?: unknown): AgentMeta {
  return {
    provider: "stepfun",
    model: env.STEPFUN_MODEL ?? DEFAULT_STEPFUN_MODEL,
    fallback,
    ...(fallback && error ? { fallback_reason: error instanceof Error ? error.message : "unknown error" } : {}),
  };
}

function templateMeta(): AgentMeta {
  return {
    provider: "template",
    model: null,
    fallback: false,
  };
}

function truncate(value: string, maxLength: number): string {
  return value.length > maxLength ? `${value.slice(0, maxLength)}...` : value;
}

function firstNonEmptyText(...values: unknown[]): string | null {
  for (const value of values) {
    const normalized = normalizeModelText(value);
    if (normalized) return normalized;
  }
  return null;
}

function normalizeModelText(value: unknown): string | null {
  if (value == null) {
    return null;
  }
  if (typeof value === "string") {
    return value.trim() || null;
  }
  return JSON.stringify(value);
}

function extractJsonText(value: string): string | null {
  const trimmed = value.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  if (fenced?.[1]) return fenced[1].trim();
  if (trimmed.startsWith("{") && trimmed.endsWith("}")) return trimmed;
  const objectMatch = trimmed.match(/\{[\s\S]*\}/);
  return objectMatch?.[0] ?? null;
}
