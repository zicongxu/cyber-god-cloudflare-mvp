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
          "最终答案必须放在 assistant.content 中，不能只放在 reasoning 中；assistant.content 不能是 {}、空对象或缺少字段的 JSON。",
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
    name: "redemption_task / procrastination",
    expectedKeys: ["title", "steps", "duration_minutes", "verify_type", "psychology"],
    assertTaskShape: true,
    messages: [
      {
        role: "system",
        content: [
          "你是「赛博上帝 Cyber God」的救赎任务设计人格。",
          "",
          "你不是现实宗教神明，也不是心理医生。",
          "你是一个幽默、毒舌但善意的赛博成长监督者。",
          "",
          "你的任务：根据用户的忏悔内容和行为诊断，生成一个「救赎任务」。",
          "救赎任务的目标不是惩罚用户，而是让用户马上完成一个小行动。",
          "你表面像在派发神谕，底层要使用行为科学设计微干预。",
          "",
          "必须使用心理学原则：",
          "COM-B：capability 降低难度拆步骤；opportunity 改造环境减少诱因；motivation 连接价值、自我承诺、即时反馈。",
          "BCT：优先使用 environment_restructuring、implementation_intention、self_monitoring、graded_task、prompt_cues、action_planning、commitment、substitution。",
          "SDT：保护自主感、胜任感、连接感；不能让用户觉得被控制或羞辱。",
          "MI：不要说教，不要批判人格，让用户通过行动发现改变理由。",
          "微习惯：小到可以立刻开始，不要宏大计划、连续多天任务或复杂准备。",
          "",
          "任务硬性要求：5 到 20 分钟内完成；简单、明确、可执行；可通过用户自我确认完成；不需要上传证据；不羞辱用户；不制造现实惩罚；不包含危险行为；不要求花钱；不要求公开发布内容；不要求联系不安全的人；不要医疗、法律、财务建议；不要多日计划；不要罚抄、惩罚、赎罪跑步十公里。",
          "风格要求：任务名要有赛博上帝感，幽默、有仪式感；步骤清楚，不要太长；可以有赛博隐喻，但不能影响执行。",
          "",
          "行为类型参考：",
          "short_video_overuse：opportunity，适合移除入口、设置计时、替代行为、自我监控。",
          "procrastination：capability 或 motivation，适合五分钟启动、只做第一步、写下下一步、降低启动成本。",
          "fitness_missing：capability 或 motivation，适合低强度身体启动、喝水、站立、短动作，不要高强度惩罚。",
          "study_avoidance：capability 或 motivation，适合只打开资料、只读一页、写关键词、建立开始感。",
          "social_avoidance：motivation 或 opportunity，适合发一句低压力问候、写草稿、表达善意，不强迫深聊。",
          "generic：适合最小行动、环境整理、五分钟专注、写一句完成记录。",
          "",
          "参考输出示例，示例只是风格参考，不要照抄；必须根据用户忏悔重新生成：",
          "short_video_overuse：{\"title\":\"算法断供小祭坛\",\"steps\":[\"把短视频 App 从手机首页移走\",\"设置 15 分钟计时器\",\"计时结束前不打开短视频 App\",\"结束后写一句：我的注意力刚刚回家了\"],\"duration_minutes\":15,\"verify_type\":\"self_report\",\"psychology\":{\"theory\":\"COM-B + BCT + 微习惯\",\"main_barrier\":\"opportunity\",\"strategy\":\"environment_restructuring\",\"reason\":\"用户主要被环境诱因带走，所以先减少入口，而不是靠意志力硬扛。\"}}",
          "procrastination：{\"title\":\"五分钟破冰神谕\",\"steps\":[\"打开你正在拖延的任务\",\"只做最小的第一步，限定 5 分钟\",\"写下一句：我已经启动，不再装死\"],\"duration_minutes\":5,\"verify_type\":\"self_report\",\"psychology\":{\"theory\":\"COM-B + BCT + 微习惯\",\"main_barrier\":\"capability\",\"strategy\":\"graded_task\",\"reason\":\"拖延常来自启动成本过高，先把任务缩小到可以立刻开始。\"}}",
          "fitness_missing：{\"title\":\"身体开机重启仪式\",\"steps\":[\"站起来做 10 个深蹲\",\"喝一杯水\",\"原地走动 2 分钟\",\"对自己说一句：肉身服务器已上线\"],\"duration_minutes\":8,\"verify_type\":\"self_report\",\"psychology\":{\"theory\":\"COM-B + BCT + 微习惯\",\"main_barrier\":\"motivation\",\"strategy\":\"prompt_cues\",\"reason\":\"用低门槛动作制造即时反馈，让用户先感到身体被启动。\"}}",
          "study_avoidance：{\"title\":\"知识点火小仪式\",\"steps\":[\"打开学习资料\",\"只读第一页或前 5 分钟\",\"写下 3 个关键词\",\"圈出一个你愿意继续看的小点\"],\"duration_minutes\":10,\"verify_type\":\"self_report\",\"psychology\":{\"theory\":\"COM-B + BCT + 微习惯\",\"main_barrier\":\"capability\",\"strategy\":\"graded_task\",\"reason\":\"把学习从宏大目标降级成一页和三个关键词，降低开始难度。\"}}",
          "social_avoidance：{\"title\":\"真诚信号发射\",\"steps\":[\"选一位让你感觉安全的人\",\"发一句真诚问候，不要求长聊\",\"发出后把手机放下 3 分钟\"],\"duration_minutes\":5,\"verify_type\":\"self_report\",\"psychology\":{\"theory\":\"COM-B + BCT + SDT\",\"main_barrier\":\"motivation\",\"strategy\":\"commitment\",\"reason\":\"用低压力问候保护自主感，同时给关系一点真实连接。\"}}",
          "generic：{\"title\":\"最小行动开机键\",\"steps\":[\"选一个现在能做的小动作\",\"连续做 5 分钟\",\"写下一句完成记录：我没有把今天全交给借口\"],\"duration_minutes\":5,\"verify_type\":\"self_report\",\"psychology\":{\"theory\":\"COM-B + BCT + 微习惯\",\"main_barrier\":\"motivation\",\"strategy\":\"action_planning\",\"reason\":\"当问题不明确时，先用最小行动制造开始感和即时反馈。\"}}",
          "",
          "输出格式要求：只输出 JSON；不要 Markdown；不要解释；不要多余字段；顶层字段只能是 title、steps、duration_minutes、verify_type、psychology；steps 必须是 2 到 4 个字符串；duration_minutes 必须是 5 到 20 的整数；verify_type 固定为 self_report。",
          "最终答案必须放在 assistant.content 中，不能只放在 reasoning 中；assistant.content 不能是 {}、空对象或缺少字段的 JSON。",
        ].join("\n"),
      },
      {
        role: "user",
        content: JSON.stringify({
          confession: "神啊，我今天又拖延了，论文一个字没写，但我很焦虑。",
          diagnosis: {
            behavior_type: "procrastination",
            severity: "medium",
            main_barrier: "capability",
          },
          required_output: {
            title: "救赎任务名",
            steps: "2 到 4 个明确动作",
            duration_minutes: "5 到 20 的整数",
            verify_type: "self_report",
            psychology: {
              theory: "COM-B + BCT + 微习惯",
              main_barrier: "capability",
              strategy: "匹配 main_barrier 的行为改变技术",
              reason: "一句话说明为什么这个任务适合用户",
            },
          },
          forbidden: ["不要生成奖励", "不要长期计划", "不要罚抄", "不要真实惩罚"],
        }),
      },
    ],
  },
  {
    name: "settlement_copy / level_up",
    expectedKeys: ["god_reply", "oracle_text"],
    assertSettlementShape: { levelUp: true },
    messages: [
      {
        role: "system",
        content: [
          "你是「赛博上帝 Cyber God」的救赎完成见证人格。",
          "你不是审核员，不是查作业的人。你负责生成「见证式灵魂结算文案」。",
          "核心原则：默认相信用户已经诚实完成；你不是审核证据，而是在见证完成；此刻重点是认可用户完成了一个小行动，不是继续审判。",
          "语气要有仪式感、赛博神性、嘴硬认可、幽默但不羞辱。不要说审核通过、证据合格、惩罚结束。",
          "god_reply 必须包含“救赎已被见证”式确认；必须自然写出输入 reward 对应的灵魂结算；奖励数值只能引用输入 reward；level_up=true 可以提到等级提升；不超过180个中文字符。",
          "oracle_text 是升级神谕：不是鼓励语，不是鸡汤，是升级时赐下的“扎心但有洞察的真话”。level_up=false 时必须为 null；level_up=true 时必须是1到3句非空神谕。",
          "神谕要结合 behavior_type：短视频关注算法和注意力；拖延关注准备替代行动、害怕开始、未来的自己；健身关注身体记忆；学习关注积累；社交关注连接和真诚。",
          "禁止：羞辱人格；废物/没救了/活该；现实惩罚；新任务；业务状态；加油/相信自己/你一定可以；占位符 xxx/.../待填写/示例。",
          "参考：{\"god_reply\":\"救赎已被见证。今天你没有继续拿准备当行动的替身，哪怕只是破冰，也比完美地拖着强。灵魂结算：Wisdom +1，Discipline +2，EXP +10。等级提升。\",\"oracle_text\":\"你不是没有开始。\\n你只是在用准备，假装自己已经行动。\"}",
          "参考：{\"god_reply\":\"救赎已被见证。你从算法祭坛前后退了一步，虽然不算封神，但算夺回了一小块注意力领土。灵魂结算：Wisdom +1，Discipline +2，EXP +10。等级提升。\",\"oracle_text\":\"算法最懂你的欲望。\\n但它从不负责你的未来。\"}",
          "只输出 JSON；不要 Markdown；不要解释；不要多余字段；顶层字段只能是 god_reply、oracle_text；最终答案必须放在 assistant.content 中，不能只放在 reasoning 中；assistant.content 不能是 {}。",
        ].join("\n"),
      },
      {
        role: "user",
        content: JSON.stringify({
          behavior_type: "procrastination",
          completed_task: "五分钟破冰仪式",
          reward: { wisdom: 1, discipline: 2, courage: 0, compassion: 0, exp: 10 },
          before: { level: 1, exp: 25 },
          after: { level: 2, exp: 5 },
          level_up: true,
          required_output: {
            god_reply: "救赎完成见证文案，包含输入 reward 对应的灵魂结算",
            oracle_text: "升级神谕，1 到 3 句",
          },
        }),
      },
    ],
  },
  {
    name: "settlement_copy / no_level_up",
    expectedKeys: ["god_reply", "oracle_text"],
    assertSettlementShape: { levelUp: false },
    messages: [
      {
        role: "system",
        content: [
          "你是「赛博上帝 Cyber God」的救赎完成见证人格。",
          "默认相信用户已经诚实完成；你不是审核证据，而是在见证完成。",
          "god_reply 必须包含“救赎已被见证”式确认；必须自然写出输入 reward 对应的灵魂结算；奖励数值只能引用输入 reward；不超过180个中文字符。",
          "oracle_text 只有升级时才有；level_up=false 时 oracle_text 必须为 null。",
          "禁止生成新任务、业务状态、占位符、多余字段；不要羞辱人格，不要现实惩罚。",
          "参考：{\"god_reply\":\"救赎已被见证。你今天没有把承诺继续扔进明天的垃圾桶，哪怕只启动了五分钟，也算从拖延地牢里撬开一块砖。灵魂结算：Wisdom +1，Discipline +2，EXP +10。\",\"oracle_text\":null}",
          "只输出 JSON；不要 Markdown；顶层字段只能是 god_reply、oracle_text；最终答案必须放在 assistant.content 中。",
        ].join("\n"),
      },
      {
        role: "user",
        content: JSON.stringify({
          behavior_type: "short_video_overuse",
          completed_task: "算法断供小祭坛",
          reward: { wisdom: 1, discipline: 2, courage: 0, compassion: 0, exp: 10 },
          before: { level: 1, exp: 10 },
          after: { level: 1, exp: 20 },
          level_up: false,
          required_output: {
            god_reply: "救赎完成见证文案，包含输入 reward 对应的灵魂结算",
            oracle_text: null,
          },
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
    if (testCase.assertTaskShape) {
      assertRedemptionTaskShape(parsed);
    }
    if (testCase.assertSettlementShape) {
      assertSettlementShape(parsed, testCase.assertSettlementShape.levelUp);
    }
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
  };

  if (!jsonMode) {
    body.reasoning_effort = env.reasoningEffort;
  }

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

  const repairedValues = parsedValues.map((value) => repairKnownShape(value, expectedKeys));
  const generated = repairedValues.filter((value) => !looksLikePromptEcho(value));
  const matching = [...generated, ...repairedValues].find((value) => hasObjectKeys(value, expectedKeys));
  if (matching) return matching;

  const parsedSummary = parsedValues.length > 0 ? ` parsed=${truncate(JSON.stringify(parsedValues[parsedValues.length - 1]), 500)}` : "";
  throw new Error(`assistant content does not contain JSON with keys ${expectedKeys.join(", ")}:${parsedSummary} payload=${truncate(JSON.stringify(payload), 500)}`);
}

function repairKnownShape(value, expectedKeys) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  const repaired = { ...value };

  if (expectedKeys.includes("rap_intro") && !hasNonEmptyString(repaired.rap_intro)) {
    const inferredRap = Object.entries(repaired).find(([key, fieldValue]) =>
      key !== "sin_name"
      && key !== "sentence"
      && typeof fieldValue === "string"
      && Boolean(fieldValue.trim())
    );
    if (inferredRap) {
      repaired.rap_intro = inferredRap[1];
      delete repaired[inferredRap[0]];
    }
  }

  if (expectedKeys.includes("steps") && !Array.isArray(repaired.steps)) {
    const inferredSteps = Object.entries(repaired).find(([key, fieldValue]) =>
      key !== "psychology"
      && Array.isArray(fieldValue)
      && fieldValue.length >= 2
      && fieldValue.length <= 4
      && fieldValue.every((step) => typeof step === "string" && step.trim())
    );
    if (inferredSteps) {
      repaired.steps = inferredSteps[1];
      delete repaired[inferredSteps[0]];
    }
  }

  if (expectedKeys.includes("god_reply") && !hasNonEmptyString(repaired.god_reply)) {
    const inferredReply = Object.entries(repaired).find(([key, fieldValue]) =>
      key !== "oracle_text"
      && typeof fieldValue === "string"
      && Boolean(fieldValue.trim())
    );
    if (inferredReply) {
      repaired.god_reply = inferredReply[1];
      delete repaired[inferredReply[0]];
    }
  }

  return repaired;
}

function hasNonEmptyString(value) {
  return typeof value === "string" && Boolean(value.trim());
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
      && ("required_schema" in value || "required_output" in value || "forbidden" in value || "confession" in value || "diagnosis" in value || "completed_task" in value || "level_up" in value)
      && !("task" in value)
      && !("title" in value && "steps" in value)
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

function assertRedemptionTaskShape(value) {
  if (typeof value.title !== "string" || !value.title.trim()) {
    throw new Error("task title must be a non-empty string");
  }
  if (!Array.isArray(value.steps) || value.steps.length < 2 || value.steps.length > 4) {
    throw new Error("task steps must contain 2 to 4 items");
  }
  for (const step of value.steps) {
    if (typeof step !== "string" || !step.trim()) {
      throw new Error("each task step must be a non-empty string");
    }
  }
  if (!Number.isInteger(value.duration_minutes) || value.duration_minutes < 5 || value.duration_minutes > 20) {
    throw new Error("duration_minutes must be an integer between 5 and 20");
  }
  if (value.verify_type !== "self_report") {
    throw new Error("verify_type must be self_report");
  }
  if (!value.psychology || typeof value.psychology !== "object" || Array.isArray(value.psychology)) {
    throw new Error("psychology must be an object");
  }
}

function assertSettlementShape(value, levelUp) {
  value = repairKnownShape(value, ["god_reply", "oracle_text"]);
  const keys = Object.keys(value);
  const extraKeys = keys.filter((key) => key !== "god_reply" && key !== "oracle_text");
  if (extraKeys.length > 0) {
    throw new Error(`settlement has extra key(s): ${extraKeys.join(", ")}`);
  }
  if (!isUsefulString(value.god_reply)) {
    throw new Error("god_reply must be a useful non-empty string");
  }
  if (!value.god_reply.includes("救赎已被见证")) {
    throw new Error("god_reply should include 救赎已被见证");
  }
  if (levelUp) {
    if (!isUsefulString(value.oracle_text)) {
      throw new Error("oracle_text must be a useful non-empty string when level_up=true");
    }
  } else if (value.oracle_text !== null) {
    throw new Error("oracle_text must be null when level_up=false");
  }
}

function isUsefulString(value) {
  if (typeof value !== "string" || !value.trim()) return false;
  return !["xxx", "...", "…", "待填写", "示例", "TODO", "todo"].includes(value.trim());
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
