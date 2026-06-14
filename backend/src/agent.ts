import { judgementFor, oracleFor, taskFor } from "./templates";
import type { AgentMeta, BehaviorDiagnosis, ConfessionPlan, Env, RedemptionTaskTemplate, Reward, SettlementCopy } from "./types";

const DEFAULT_STEPFUN_MODEL = "step-3.7-flash";
const DEFAULT_STEPFUN_BASE_URL = "https://api.stepfun.com/v1";
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
    const generated = await chatJson<unknown>(params.env, [
      {
        role: "system",
        content: [
          "你是赛博上帝的审判文案生成器。",
          "只输出一个严格 JSON 对象，不要输出 Markdown，不要解释。",
          "顶层字段只能包含 rap_intro、sin_name、sentence。",
          "你只负责基于用户忏悔生成幽默审判文案，不要生成任务、奖励或业务状态。",
          "审判行为，不羞辱人格；吐槽选择，不攻击身份。",
          "rap_intro 是两到四句 Rap 式吐槽。",
          "sin_name 是荒诞但无害的罪名。",
          "sentence 是荒诞但无害的判决。",
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
            rap_intro: "两到四句 Rap 式吐槽",
            sin_name: "荒诞但无害的罪名",
            sentence: "荒诞但无害的判决",
          },
        }),
      },
    ], isJudgementCopyJson);
    const judgement = normalizeJudgementCopy(generated);

    const agentMeta = stepfunMeta(params.env, false);

    return {
      diagnosis: params.diagnosis,
      judgement: {
        rap_intro: judgement.rap_intro,
        sin_name: judgement.sin_name,
        sentence: judgement.sentence,
        roast_level: params.roastLevel,
      },
      task: fallbackPlan.task,
      agent_meta: agentMeta,
    };
  } catch (error) {
    throw new Error(error instanceof Error ? error.message : "StepFun request failed");
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
    const generated = await chatJson<{ god_reply: string; oracle_text?: string | null }>(params.env, [
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
    ], (value): value is { god_reply: string; oracle_text?: string | null } => isSettlementCopyJson(value, params.levelUp));

    return {
      god_reply: generated.god_reply.trim(),
      oracle_text: params.levelUp ? requireModelString(generated.oracle_text, "oracle_text") : null,
      agent_meta: stepfunMeta(params.env, false),
    };
  } catch (error) {
    throw new Error(error instanceof Error ? error.message : "StepFun request failed");
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

export async function chatWithStepFun(env: Env, messages: ChatMessage[]): Promise<{ content: string; meta: AgentMeta }> {
  if (!env.STEPFUN_API_KEY) {
    throw new Error("STEPFUN_API_KEY is not configured");
  }

  const payload = await requestStepFun(env, messages, false, false);
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

  const response = await fetchStepFunOnce(env, messages, true, false);

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

async function chatJson<T>(env: Env, messages: ChatMessage[], isValid?: (value: unknown) => value is T): Promise<T> {
  let lastError: unknown;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const payload = await requestStepFun(env, messages, false, true);
      const parsed = parseStepFunJson<T>(payload);
      if (isValid && !isValid(parsed)) {
        throw new Error(`StepFun response does not match required schema: ${truncate(JSON.stringify(parsed), 240)}`);
      }
      return parsed;
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError instanceof Error ? lastError : new Error("StepFun JSON request failed");
}

function isJudgementCopyJson(value: unknown): value is {
  rap_intro: string;
  sin_name: string;
  sentence: string;
} {
  const candidate = unwrapJudgementEnvelope(value);
  return isRecord(candidate)
    && typeof candidate.rap_intro === "string"
    && typeof candidate.sin_name === "string"
    && typeof candidate.sentence === "string";
}

function normalizeJudgementCopy(value: unknown): {
  rap_intro: string;
  sin_name: string;
  sentence: string;
} {
  const candidate = unwrapJudgementEnvelope(value);
  if (!isRecord(candidate)) {
    throw new Error("StepFun response missing judgement copy");
  }

  return {
    rap_intro: requireModelString(candidate.rap_intro, "rap_intro"),
    sin_name: requireModelString(candidate.sin_name, "sin_name"),
    sentence: requireModelString(candidate.sentence, "sentence"),
  };
}

function unwrapJudgementEnvelope(value: unknown): unknown {
  if (!isRecord(value)) {
    return value;
  }

  return isRecord(value.judgement) ? value.judgement : value;
}

function requireModelString(value: unknown, name: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`StepFun response missing ${name}`);
  }
  return value.trim();
}

function isSettlementCopyJson(value: unknown, requireOracleText: boolean): value is { god_reply: string; oracle_text?: string | null } {
  if (!isRecord(value) || typeof value.god_reply !== "string" || !value.god_reply.trim()) {
    return false;
  }

  return !requireOracleText || (typeof value.oracle_text === "string" && Boolean(value.oracle_text.trim()));
}

type StepFunPayload = {
  choices?: Array<{ message?: { content?: unknown; reasoning_content?: unknown; reasoning?: unknown } }>;
  output_text?: unknown;
};

async function requestStepFun(env: Env, messages: ChatMessage[], stream: boolean, jsonMode: boolean): Promise<StepFunPayload> {
  const response = await fetchStepFunOnce(env, messages, stream, jsonMode);

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`StepFun request failed: ${response.status} ${truncate(errorText, 160)}`);
  }

  return response.json<StepFunPayload>();
}

function fetchStepFunOnce(env: Env, messages: ChatMessage[], stream: boolean, jsonMode: boolean): Promise<Response> {
  const baseUrl = env.STEPFUN_BASE_URL ?? DEFAULT_STEPFUN_BASE_URL;
  const model = env.STEPFUN_MODEL ?? DEFAULT_STEPFUN_MODEL;
  const body: Record<string, unknown> = {
    model,
    messages,
    temperature: jsonMode ? 0.2 : 0.7,
    top_p: 0.9,
    max_tokens: jsonMode ? 1000 : 800,
    stream,
    reasoning_effort: env.STEPFUN_REASONING_EFFORT ?? DEFAULT_REASONING_EFFORT,
  };

  if (jsonMode && !stream) {
    body.response_format = { type: "json_object" };
  }

  return fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${env.STEPFUN_API_KEY}`,
    },
    body: JSON.stringify(body),
  });
}

function extractStepFunContent(payload: StepFunPayload): string | null {
  const message = payload.choices?.[0]?.message;
  return firstNonEmptyText(message?.content, payload.output_text);
}

function parseStepFunJson<T>(payload: StepFunPayload): T {
  const candidates = extractStepFunJsonCandidates(payload);
  if (candidates.length === 0) {
    throw new Error(`StepFun response does not contain JSON: ${truncate(JSON.stringify(payload), 240)}`);
  }

  const errors: string[] = [];
  const parsedValues: unknown[] = [];
  for (const candidate of candidates) {
    const parsed = tryParseJson<unknown>(candidate);
    if (parsed.ok) {
      parsedValues.push(unwrapJsonEnvelope(parsed.value));
      continue;
    }
    errors.push(parsed.error);
  }

  const selected = selectGeneratedJsonValue(parsedValues);
  if (selected !== undefined) {
    return selected as T;
  }

  throw new Error(`StepFun response is not valid JSON: ${truncate(candidates[0], 240)}; ${errors[0]}`);
}

function selectGeneratedJsonValue(values: unknown[]): unknown | undefined {
  const generated = values.filter((value) => !looksLikePromptEcho(value));
  return generated[generated.length - 1] ?? values[values.length - 1];
}

function looksLikePromptEcho(value: unknown): boolean {
  if (!isRecord(value)) {
    return false;
  }

  return (
    ("required_schema" in value || "confession" in value || "diagnosis" in value || "completed_task" in value || "level_up" in value)
    && !("judgement" in value)
    && !("task" in value)
    && !("god_reply" in value)
  );
}

function unwrapJsonEnvelope(value: unknown): unknown {
  if (!isRecord(value)) {
    return value;
  }

  const content = value.content;
  if (isRecord(content)) {
    return content;
  }

  if (typeof content === "string") {
    const candidates = extractJsonTexts(content);
    for (const candidate of candidates) {
      const parsed = tryParseJson<unknown>(candidate);
      if (parsed.ok) {
        return unwrapJsonEnvelope(parsed.value);
      }
    }
  }

  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function extractStepFunJsonCandidates(payload: StepFunPayload): string[] {
  const message = payload.choices?.[0]?.message;
  const rawTexts = [
    message?.content,
    payload.output_text,
    // StepFun reasoning models may occasionally put the structured answer in reasoning
    // even when prompted to use assistant.content. This is still a real StepFun result,
    // not a local template fallback, so use it only as an extraction source.
    message?.reasoning_content,
    message?.reasoning,
  ];
  const candidates: string[] = [];

  for (const rawText of rawTexts) {
    const text = normalizeModelText(rawText);
    if (!text) continue;
    candidates.push(...extractJsonTexts(text));
  }

  return Array.from(new Set(candidates));
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

function extractJsonTexts(value: string): string[] {
  const trimmed = value.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  const source = fenced?.[1]?.trim() ?? trimmed;
  const candidates = collectBalancedJsonObjects(source);
  return candidates.length > 0 ? candidates : source.startsWith("{") ? [source] : [];
}

function collectBalancedJsonObjects(value: string): string[] {
  const objects: string[] = [];
  let depth = 0;
  let start = -1;
  let inString = false;
  let escaped = false;

  for (let index = 0; index < value.length; index += 1) {
    const char = value[index];

    if (escaped) {
      escaped = false;
      continue;
    }

    if (char === "\\") {
      escaped = inString;
      continue;
    }

    if (char === "\"") {
      inString = !inString;
      continue;
    }

    if (inString) {
      continue;
    }

    if (char === "{") {
      if (depth === 0) {
        start = index;
      }
      depth += 1;
      continue;
    }

    if (char === "}" && depth > 0) {
      depth -= 1;
      if (depth === 0 && start >= 0) {
        objects.push(value.slice(start, index + 1).trim());
        start = -1;
      }
    }
  }

  return objects;
}

function tryParseJson<T>(value: string): { ok: true; value: T } | { ok: false; error: string } {
  const attempts = [value, repairJsonText(value)];
  let lastError = "unknown parse error";

  for (const attempt of attempts) {
    try {
      return { ok: true, value: JSON.parse(attempt) as T };
    } catch (error) {
      lastError = error instanceof Error ? error.message : "unknown parse error";
    }
  }

  return { ok: false, error: lastError };
}

function repairJsonText(value: string): string {
  return escapeControlCharactersInJsonStrings(
    value
      .replace(/^\uFEFF/, "")
      .trim()
      .replace(/,\s*([}\]])/g, "$1"),
  );
}

function escapeControlCharactersInJsonStrings(value: string): string {
  let result = "";
  let inString = false;
  let escaped = false;

  for (const char of value) {
    if (escaped) {
      result += char;
      escaped = false;
      continue;
    }

    if (char === "\\" && inString) {
      result += char;
      escaped = true;
      continue;
    }

    if (char === "\"") {
      result += char;
      inString = !inString;
      continue;
    }

    if (inString) {
      if (char === "\n") {
        result += "\\n";
        continue;
      }
      if (char === "\r") {
        result += "\\r";
        continue;
      }
      if (char === "\t") {
        result += "\\t";
        continue;
      }
      if (char < " ") {
        result += `\\u${char.charCodeAt(0).toString(16).padStart(4, "0")}`;
        continue;
      }
    }

    result += char;
  }

  return result;
}
