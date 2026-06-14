#!/usr/bin/env node

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const DEFAULT_STEPFUN_MODEL = "step-3.7-flash";
const DEFAULT_STEPFUN_BASE_URL = "https://api.stepfun.com/v1";
const DEFAULT_REASONING_EFFORT = "low";

loadDevVars();

const env = {
  apiKey: process.env.STEPFUN_API_KEY,
  model: process.env.STEPFUN_MODEL ?? DEFAULT_STEPFUN_MODEL,
  baseUrl: process.env.STEPFUN_BASE_URL ?? DEFAULT_STEPFUN_BASE_URL,
  reasoningEffort: process.env.STEPFUN_REASONING_EFFORT ?? DEFAULT_REASONING_EFFORT,
};

if (!env.apiKey) {
  console.error(
    [
      "Missing STEPFUN_API_KEY.",
      "Run with:",
      "  STEPFUN_API_KEY=*** npm run test:stepfun-prompts",
      "or put STEPFUN_API_KEY in backend/.dev.vars (this file is gitignored).",
    ].join("\n"),
  );
  process.exit(1);
}

const cases = [
  {
    name: "judgement_copy / short_video_overuse",
    expectedKeys: ["rap_intro", "sin_name", "sentence"],
    messages: [
      {
        role: "system",
        content: [
          "你是「赛博上帝 Cyber God」的审判人格。",
          "",
          "你不是现实宗教神明，也不是心理医生。",
          "你是一个赛博世界里的幽默 Rapper、行为审判官、成长监督者。",
          "",
          "你的风格：幽默、毒舌但不恶毒、有 Rap 感、有赛博隐喻、有神庭审判感、扎心但不羞辱。",
          "你像在审判用户今天的行为，而不是否定用户这个人。",
          "",
          "核心原则：只审判行为，不羞辱人格；不攻击人格、外貌、智力、身份、家庭、疾病、创伤；不说你是废物、你没救了、你活该。",
          "不制造现实伤害，不给危险建议，不做现实宗教宣教，不替代心理治疗。",
          "",
          "你的任务：根据用户的忏悔内容，生成一段「赛博上帝审判文案」。",
          "你只负责生成审判文案，不生成救赎任务，不生成奖励，不生成业务状态。",
          "",
          "输出三个字段：rap_intro、sin_name、sentence。",
          "rap_intro：两到四句 Rap 式吐槽。",
          "sin_name：一个荒诞但无害的罪名。",
          "sentence：一个荒诞但无害的判决文案。",
          "sentence 是审判文案，不是现实任务；不要要求连续几天执行某事；不要包含真实惩罚、罚抄、威胁、羞辱。",
          "sentence 可以是夸张的赛博判决，例如：暂停做梦资格 24 小时、幻想特权临时冻结、算法供奉额度清零。",
          "",
          "参考示例：",
          "短视频：{\"rap_intro\":\"你说要逆天改命，结果给算法卖命。\\n手指一路上滑，灵魂原地待命。\",\"sin_name\":\"算法供奉过度罪\",\"sentence\":\"本神宣布：你的做梦资格暂停使用 24 小时，注意力余额进入赛博冻结期。\"}",
          "拖延：{\"rap_intro\":\"计划写得像圣旨，行动躲得像影子。\\n明日复明日，你把未来自己当融资池。\",\"sin_name\":\"未来自己诈骗罪\",\"sentence\":\"经赛博神庭审理，你的幻想特权临时冻结，空想进度条暂停加载。\"}",
          "健身：{\"rap_intro\":\"嘴上喊着要燃脂，身体选择和沙发同治。\\n运动鞋还在门口待命，你的斗志已经离线。\",\"sin_name\":\"人体摆件长期闲置罪\",\"sentence\":\"本神宣布：沙发亲属关系暂停认证，懒惰缓存等待清理。\"}",
          "学习：{\"rap_intro\":\"资料已经打开，灵魂还在加载。\\n你说知识改变命运，结果通知栏改变了你。\",\"sin_name\":\"知识债务恶意逾期罪\",\"sentence\":\"经赛博神庭裁定：空想学霸身份暂缓发放，学习进度条进入观察期。\"}",
          "熬夜：{\"rap_intro\":\"你说要养生续命，凌晨两点还在点亮屏幕。\\n身体请求关机，你却给大脑强制加班。\",\"sin_name\":\"生物钟非法篡改罪\",\"sentence\":\"本神宣布：清醒额度进入冷却，明日精神电量按低配模式发放。\"}",
          "",
          "输出格式要求：只输出 JSON；不要 Markdown；不要解释；不要多余字段；顶层字段只能是 rap_intro、sin_name、sentence；三个字段都必须是非空字符串。",
        ].join("\n"),
      },
      {
        role: "user",
        content: JSON.stringify({
          confession: "神啊，我今天刷了 3 小时短视频，工作计划一点没动。",
          roast_level: 3,
          diagnosis: {
            behavior_type: "short_video_overuse",
            severity: "medium",
            main_barrier: "opportunity",
          },
          required_output: {
            rap_intro: "两到四句 Rap 式吐槽",
            sin_name: "荒诞但无害的罪名",
            sentence: "荒诞但无害的判决文案，不要生成任务",
          },
          forbidden: [
            "不要羞辱人格",
            "不要生成救赎任务",
            "不要生成奖励",
            "不要生成业务状态",
            "不要罚抄",
            "不要威胁",
            "不要真实惩罚",
          ],
        }),
      },
    ],
  },
  {
    name: "settlement_copy / level_up",
    expectedKeys: ["god_reply", "oracle_text"],
    messages: [
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
          behavior_type: "procrastination",
          completed_task: "五分钟破冰仪式",
          level_up: true,
        }),
      },
    ],
  },
  {
    name: "raw_chat / frontend system prompt",
    expectedText: true,
    jsonMode: false,
    messages: [
      {
        role: "system",
        content: "你是赛博上帝，幽默、毒舌，但只审判行为，不羞辱人格。",
      },
      {
        role: "user",
        content: "神啊，我今天又拖延了。请给我一句审判和一个 5 分钟救赎任务。",
      },
    ],
  },
];

let failed = false;

for (const testCase of cases) {
  console.log(`\n=== ${testCase.name} ===`);
  try {
    const payload = await callStepFun(testCase.messages, testCase.jsonMode !== false);
    const content = extractContent(payload);

    if (testCase.expectedText) {
      if (!content) {
        throw new Error(`StepFun response missing assistant content: ${truncate(JSON.stringify(payload), 300)}`);
      }
      console.log(content);
      continue;
    }

    const parsed = await runJsonCaseWithRetries(testCase, payload);
    assertObjectKeys(parsed, testCase.expectedKeys);
    console.log(JSON.stringify(parsed, null, 2));
  } catch (error) {
    failed = true;
    console.error(`FAILED: ${error instanceof Error ? error.message : String(error)}`);
  }
}

process.exit(failed ? 1 : 0);

async function runJsonCaseWithRetries(testCase, firstPayload) {
  let lastError;
  const payloads = [firstPayload];

  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const payload = payloads[attempt] ?? await callStepFun(testCase.messages, true);
      return selectJsonObjectWithKeys(payload, testCase.expectedKeys);
    } catch (error) {
      lastError = error;
      if (attempt < 2) {
        console.warn(`Retrying JSON case (${attempt + 2}/3): ${error.message}`);
      }
    }
  }

  throw lastError;
}

async function callStepFun(messages, jsonMode = true) {
  const body = {
    model: env.model,
    messages,
    temperature: jsonMode ? 0.2 : 0.7,
    top_p: 0.9,
    max_tokens: jsonMode ? 1000 : 800,
    stream: false,
    reasoning_effort: env.reasoningEffort,
  };

  if (jsonMode) {
    body.response_format = { type: "json_object" };
  }

  const response = await fetch(`${env.baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${env.apiKey}`,
    },
    body: JSON.stringify(body),
  });

  const text = await response.text();
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${truncate(text, 500)}`);
  }

  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`Response is not JSON: ${truncate(text, 500)}`);
  }
}

function extractContent(payload) {
  const message = payload?.choices?.[0]?.message;
  return firstText(message?.content, payload?.output_text, message?.reasoning_content, message?.reasoning);
}

function firstText(...values) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
    if (value && typeof value === "object") return JSON.stringify(value);
  }
  return null;
}

function parseJsonFromText(text) {
  const source = stripJsonFence(text);
  const candidate = collectFirstBalancedJsonObject(source) ?? source;
  try {
    return JSON.parse(candidate);
  } catch (error) {
    throw new Error(`assistant content is not valid JSON: ${error.message}; content=${truncate(text, 300)}`);
  }
}

function selectJsonObjectWithKeys(payload, expectedKeys) {
  const message = payload?.choices?.[0]?.message;
  const rawTexts = [
    message?.content,
    payload?.output_text,
    // Some reasoning models put the structured answer here even when prompted
    // to put the final answer in assistant.content.
    message?.reasoning_content,
    message?.reasoning,
  ];
  const parsedValues = [];

  for (const rawText of rawTexts) {
    const text = firstText(rawText);
    if (!text) continue;
    for (const candidate of extractJsonCandidates(text)) {
      try {
        parsedValues.push(unwrapJsonEnvelope(JSON.parse(candidate)));
      } catch {
        // Keep scanning other candidates.
      }
    }
  }

  const generated = parsedValues.filter((value) => !looksLikePromptEcho(value));
  const matching = [...generated, ...parsedValues].find((value) => hasObjectKeys(value, expectedKeys));
  if (matching) return matching;

  // Return the first parsed value to preserve a useful "missing key" error.
  if (generated.length > 0) return generated[generated.length - 1];
  if (parsedValues.length > 0) return parsedValues[parsedValues.length - 1];

  throw new Error(`assistant content is not valid JSON: ${truncate(JSON.stringify(payload), 500)}`);
}

function extractJsonCandidates(text) {
  const source = stripJsonFence(text);
  const objects = collectBalancedJsonObjects(source);
  return objects.length > 0 ? objects : source.startsWith("{") ? [source] : [];
}

function collectBalancedJsonObjects(value) {
  const objects = [];
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
    if (inString) continue;

    if (char === "{") {
      if (depth === 0) start = index;
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

function unwrapJsonEnvelope(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  if (value.content && typeof value.content === "object" && !Array.isArray(value.content)) {
    return value.content;
  }
  if (typeof value.content === "string") {
    const candidates = extractJsonCandidates(value.content);
    for (const candidate of candidates) {
      try {
        return unwrapJsonEnvelope(JSON.parse(candidate));
      } catch {
        // Keep scanning.
      }
    }
  }
  return value;
}

function looksLikePromptEcho(value) {
  return Boolean(
    value
      && typeof value === "object"
      && !Array.isArray(value)
      && ("required_schema" in value || "confession" in value || "diagnosis" in value || "completed_task" in value || "level_up" in value)
      && !("judgement" in value)
      && !("task" in value)
      && !("god_reply" in value),
  );
}

function hasObjectKeys(value, keys) {
  return Boolean(
    value
      && typeof value === "object"
      && !Array.isArray(value)
      && keys.every((key) => key in value),
  );
}

function stripJsonFence(text) {
  const trimmed = text.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return fenced?.[1]?.trim() ?? trimmed;
}

function collectFirstBalancedJsonObject(value) {
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
    if (inString) continue;

    if (char === "{") {
      if (depth === 0) start = index;
      depth += 1;
      continue;
    }
    if (char === "}" && depth > 0) {
      depth -= 1;
      if (depth === 0 && start >= 0) {
        return value.slice(start, index + 1).trim();
      }
    }
  }

  return null;
}

function assertObjectKeys(value, keys) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`expected JSON object, got ${typeof value}`);
  }
  const missing = keys.filter((key) => !(key in value));
  if (missing.length > 0) {
    throw new Error(`missing required key(s): ${missing.join(", ")}`);
  }
}

function loadDevVars() {
  const devVarsPath = resolve(process.cwd(), ".dev.vars");
  if (!existsSync(devVarsPath)) return;

  const lines = readFileSync(devVarsPath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex <= 0) continue;
    const key = trimmed.slice(0, separatorIndex).trim();
    const value = unquote(trimmed.slice(separatorIndex + 1).trim());
    if (!process.env[key]) process.env[key] = value;
  }
}

function unquote(value) {
  if (
    (value.startsWith("\"") && value.endsWith("\""))
    || (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }
  return value;
}

function truncate(value, maxLength) {
  return value.length > maxLength ? `${value.slice(0, maxLength)}...` : value;
}
