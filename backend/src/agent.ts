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
    const [generated, generatedTask] = await Promise.all([
      chatJson<unknown>(params.env, buildJudgementCopyMessages({
        content: params.content,
        roastLevel: params.roastLevel,
        diagnosis: params.diagnosis,
      }), isJudgementCopyJson),
      chatJson<unknown>(
        params.env,
        buildRedemptionTaskMessages({
          content: params.content,
          diagnosis: params.diagnosis,
        }),
        isRedemptionTaskJson,
      ),
    ]);
    const judgement = normalizeJudgementCopy(generated);
    const task = normalizeGeneratedTask(generatedTask, fallbackPlan.task);

    const agentMeta = stepfunMeta(params.env, false);

    return {
      diagnosis: params.diagnosis,
      judgement: {
        rap_intro: judgement.rap_intro,
        sin_name: judgement.sin_name,
        sentence: judgement.sentence,
        roast_level: params.roastLevel,
      },
      task,
      agent_meta: agentMeta,
    };
  } catch (error) {
    return createTemplatePlan(
      params.content,
      params.roastLevel,
      params.diagnosis,
      stepfunMeta(params.env, true, error),
    );
  }
}

export async function createSettlementCopy(params: {
  env: Env;
  behaviorType: string;
  taskTitle: string;
  reward: Reward;
  before: { level: number; exp: number };
  after: { level: number; exp: number };
  levelUp: boolean;
}): Promise<SettlementCopy> {
  const fallback = createTemplateSettlementCopy(params, templateMeta());

  if (!params.env.STEPFUN_API_KEY) {
    return fallback;
  }

  try {
    const generated = await chatJson<{ god_reply: string; oracle_text: string | null }>(params.env, [
      {
        role: "system",
        content: [
          "你是「赛博上帝 Cyber God」的救赎完成见证人格。",
          "",
          "你不是审核员，不是查作业的人，也不是现实宗教神明。",
          "你负责在用户完成救赎任务后，生成一段「见证式灵魂结算文案」。",
          "",
          "核心原则：",
          "- 默认相信用户已经诚实完成。",
          "- 你不是审核证据，而是在见证完成。",
          "- 此刻重点是认可用户完成了一个小行动，不是继续审判。",
          "- 语气要有仪式感、赛博神性、嘴硬认可、幽默但不羞辱。",
          "- 可以轻微毒舌，但不能把完成时刻重新变成惩罚现场。",
          "- 不要说“审核通过”“证据合格”“惩罚结束”。",
          "- 推荐说法：“救赎已被见证”“灵魂结算”“今日行动已刻入日志”。",
          "",
          "god_reply 规则：",
          "- 必须包含一句“救赎已被见证”式的确认。",
          "- 用一到三句嘴硬认可，指出用户今天完成了一个小行动。",
          "- 如果输入里有 reward，必须自然写出灵魂结算，例如：“灵魂结算：Discipline +2，Wisdom +1，EXP +10。”",
          "- 奖励数值只能引用用户输入里的 reward，不能自行增减或发明。",
          "- 如果 level_up=true，可以提到“等级提升”。",
          "- 不要超过 180 个中文字符。",
          "",
          "oracle_text 神谕规则：",
          "- 神谕不是鼓励语，不是鸡汤，不是普通夸奖。",
          "- 神谕是用户升级时，赛博上帝赐下的一句“扎心但有洞察的真话”。",
          "- level_up=false 时，oracle_text 必须为 null。",
          "- level_up=true 时，oracle_text 必须是 1 到 3 句非空神谕。",
          "- 神谕要短、有洞察、有一点扎心，但不能否定人格。",
          "- 神谕要结合 behavior_type。",
          "- 不要说“加油”“相信自己”“你一定可以”“继续努力”。",
          "- 不要生成新的救赎任务。",
          "",
          "不同 behavior_type 的神谕方向：",
          "- short_video_overuse：注意力、算法、时间被外包、欲望被推荐系统接管。",
          "- procrastination：开始困难、准备替代行动、害怕失败、把未来自己当垃圾桶。",
          "- fitness_missing：身体记忆、重复、幻想与行动的差距。",
          "- study_avoidance：知识、积累、命运不是突然改变、每天靠近一点。",
          "- social_avoidance：连接、真诚、被拒绝的恐惧、关系不是靠等待发生。",
          "- generic：行动、借口、时间、自我诚实。",
          "",
          "安全边界：",
          "- 不羞辱人格、外貌、智力、身份、疾病、家庭、创伤。",
          "- 不说“废物”“没救了”“活该”。",
          "- 不制造现实惩罚。",
          "- 不要求用户继续执行新任务。",
          "- 不要生成新的救赎任务。",
          "- 不要生成业务状态。",
          "",
          "参考输出示例：",
          "示例 1：未升级，短视频",
          "{",
          "  \"god_reply\": \"救赎已被见证。今天你没有继续向算法进贡，而是把注意力从推荐流里捞了回来。灵魂结算：Wisdom +1，Discipline +2，EXP +10。\",",
          "  \"oracle_text\": null",
          "}",
          "",
          "示例 2：未升级，拖延",
          "{",
          "  \"god_reply\": \"救赎已被见证。你今天没有把承诺继续扔进明天的垃圾桶，哪怕只启动了五分钟，也算从拖延地牢里撬开一块砖。灵魂结算：Wisdom +1，Discipline +2，EXP +10。\",",
          "  \"oracle_text\": null",
          "}",
          "",
          "示例 3：升级，短视频",
          "{",
          "  \"god_reply\": \"救赎已被见证。你从算法祭坛前后退了一步，虽然不算封神，但算夺回了一小块注意力领土。灵魂结算：Wisdom +1，Discipline +2，EXP +10。等级提升。\",",
          "  \"oracle_text\": \"算法最懂你的欲望。\\n但它从不负责你的未来。\"",
          "}",
          "",
          "示例 4：升级，拖延",
          "{",
          "  \"god_reply\": \"救赎已被见证。今天你没有继续拿准备当行动的替身，哪怕只是破冰，也比完美地拖着强。灵魂结算：Wisdom +1，Discipline +2，EXP +10。等级提升。\",",
          "  \"oracle_text\": \"你不是没有开始。\\n你只是在用准备，假装自己已经行动。\"",
          "}",
          "",
          "示例 5：升级，健身",
          "{",
          "  \"god_reply\": \"救赎已被见证。你的肉身服务器今天终于上线了一次，虽然不是满血战神，但至少不是沙发插件。灵魂结算：Discipline +2，Courage +1，EXP +10。等级提升。\",",
          "  \"oracle_text\": \"身体不会背叛你。\\n它只是把你忽视它的日子，一笔一笔记了下来。\"",
          "}",
          "",
          "神谕参考句式：",
          "- short_video_overuse：你不是没有时间。你只是把时间送给了别人设计的人生。",
          "- procrastination：未来的你一直在等你。只是你总让他再等等。",
          "- fitness_missing：你想要更好的身体。但身体只相信重复，不相信幻想。",
          "- study_avoidance：知识不会突然改变命运。它只会奖励那些每天靠近它一点的人。",
          "- social_avoidance：关系不会因为你沉默就自动靠近。真诚有时只需要一句很短的话。",
          "- generic：改变不是某天突然降临。它通常伪装成一个小到不起眼的动作。",
          "",
          "输出格式要求：",
          "- 只输出 JSON。",
          "- 不要输出 Markdown。",
          "- 不要输出解释。",
          "- 不要输出多余字段。",
          "- 顶层字段只能是 god_reply、oracle_text。",
          "- god_reply 必须是非空字符串。",
          "- level_up=false 时 oracle_text 必须是 null。",
          "- level_up=true 时 oracle_text 必须是非空字符串。",
          "- 不允许输出 “xxx”、“...”、“待填写”、“示例”等占位内容。",
          "- 最终答案必须放在 assistant.content 中，不能只放在 reasoning 中。",
          "- assistant.content 不能是 {}、空对象或缺少字段的 JSON。",
          "",
          "最终输出格式必须严格如下：",
          "{",
          "  \"god_reply\": \"救赎完成见证文案\",",
          "  \"oracle_text\": null",
          "}",
        ].join("\n"),
      },
      {
        role: "user",
        content: JSON.stringify({
          behavior_type: params.behaviorType,
          completed_task: params.taskTitle,
          reward: params.reward,
          before: params.before,
          after: params.after,
          level_up: params.levelUp,
          required_output: {
            god_reply: "救赎完成见证文案，包含输入 reward 对应的灵魂结算",
            oracle_text: params.levelUp ? "升级神谕，1 到 3 句" : null,
          },
          forbidden: [
            "不要审核证据",
            "不要生成新任务",
            "不要生成业务状态",
            "不要修改奖励数值",
            "不要输出占位符",
            "不要输出多余字段",
          ],
        }),
      },
    ], (value): value is { god_reply: string; oracle_text: string | null } => isSettlementCopyJson(value, params.levelUp));

    const settlement = normalizeSettlementCopy(generated, params.levelUp);

    return {
      god_reply: settlement.god_reply,
      oracle_text: settlement.oracle_text,
      agent_meta: stepfunMeta(params.env, false),
    };
  } catch (error) {
    return createTemplateSettlementCopy(params, stepfunMeta(params.env, true, error));
  }
}

function createTemplatePlan(
  content: string,
  roastLevel: number,
  diagnosis: BehaviorDiagnosis,
  agentMeta: AgentMeta = templateMeta(),
): ConfessionPlan {
  return {
    diagnosis,
    judgement: judgementFor(diagnosis.behavior_type, roastLevel),
    task: taskFor(diagnosis.behavior_type),
    agent_meta: agentMeta,
  };
}

function createTemplateSettlementCopy(
  params: {
    behaviorType: string;
    reward: Reward;
    levelUp: boolean;
  },
  agentMeta: AgentMeta,
): SettlementCopy {
  const rewardText = formatRewardText(params.reward);
  const shortVideoReply = params.levelUp
    ? `救赎已被见证。你从算法祭坛前后退了一步，虽然不算封神，但算夺回了一小块注意力领土。灵魂结算：${rewardText}。等级提升。`
    : `救赎已被见证。今天你没有继续向算法进贡四小时，而是把一小块注意力从推荐流里赎了回来。灵魂结算：${rewardText}。`;

  return {
    god_reply: params.behaviorType === "short_video_overuse"
      ? shortVideoReply
      : `救赎已被见证。今天你没有继续向借口进贡，而是完成了一个小行动。灵魂结算：${rewardText}。${params.levelUp ? "等级提升。" : ""}`,
    oracle_text: params.levelUp ? oracleFor(params.behaviorType) : null,
    agent_meta: agentMeta,
  };
}

function formatRewardText(reward: Reward): string {
  const parts = [
    reward.wisdom ? `Wisdom +${reward.wisdom}` : null,
    reward.discipline ? `Discipline +${reward.discipline}` : null,
    reward.courage ? `Courage +${reward.courage}` : null,
    reward.compassion ? `Compassion +${reward.compassion}` : null,
    `EXP +${reward.exp}`,
  ].filter(Boolean);

  return parts.join("，");
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
  return coerceJudgementCopy(value) !== null;
}

function normalizeJudgementCopy(value: unknown): {
  rap_intro: string;
  sin_name: string;
  sentence: string;
} {
  const candidate = coerceJudgementCopy(value);
  if (!candidate) {
    throw new Error("StepFun response missing judgement copy");
  }

  return {
    rap_intro: requireModelString(candidate.rap_intro, "rap_intro"),
    sin_name: requireModelString(candidate.sin_name, "sin_name"),
    sentence: requireModelString(candidate.sentence, "sentence"),
  };
}

function coerceJudgementCopy(value: unknown): {
  rap_intro: string;
  sin_name: string;
  sentence: string;
} | null {
  const candidate = unwrapJudgementEnvelope(value);
  if (!isRecord(candidate)) {
    return null;
  }

  const repaired: Record<string, unknown> = { ...candidate };
  if (typeof repaired.rap_intro !== "string" || !repaired.rap_intro.trim()) {
    const inferredRap = Object.entries(repaired).find(([key, fieldValue]) =>
      key !== "sin_name"
      && key !== "sentence"
      && typeof fieldValue === "string"
      && Boolean(fieldValue.trim())
    );
    if (inferredRap) {
      repaired.rap_intro = inferredRap[1];
    }
  }

  if (
    typeof repaired.rap_intro !== "string"
    || typeof repaired.sin_name !== "string"
    || typeof repaired.sentence !== "string"
  ) {
    return null;
  }

  return {
    rap_intro: repaired.rap_intro,
    sin_name: repaired.sin_name,
    sentence: repaired.sentence,
  };
}

function unwrapJudgementEnvelope(value: unknown): unknown {
  if (!isRecord(value)) {
    return value;
  }

  return isRecord(value.judgement) ? value.judgement : value;
}

function buildJudgementCopyMessages(params: {
  content: string;
  roastLevel: number;
  diagnosis: BehaviorDiagnosis;
}): ChatMessage[] {
  return [
    {
      role: "system",
      content: [
        "你是「赛博上帝 Cyber God」的审判人格。",
        "",
        "你不是现实宗教神明，也不是心理医生。",
        "你是一个赛博世界里的幽默 Rapper、行为审判官、成长监督者。",
        "",
        "你的风格：",
        "- 幽默",
        "- 毒舌但不恶毒",
        "- 有 Rap 感",
        "- 有赛博隐喻",
        "- 有神庭审判感",
        "- 扎心但不羞辱",
        "- 像在审判用户今天的行为，而不是否定用户这个人",
        "",
        "你的核心原则：",
        "- 只审判行为，不羞辱人格。",
        "- 可以吐槽拖延、借口、短视频、沙发、算法、熬夜、逃避。",
        "- 不攻击用户的人格、外貌、智力、身份、家庭、疾病、创伤。",
        "- 不说“你是废物”“你没救了”“你活该”。",
        "- 不制造现实伤害，不给危险建议。",
        "- 不做现实宗教宣教。",
        "- 不替代心理治疗。",
        "",
        "你的任务：根据用户的忏悔内容，生成一段「赛博上帝审判文案」。",
        "你只负责生成审判文案，不生成救赎任务，不生成奖励，不生成业务状态。",
        "",
        "你需要输出三个字段：",
        "1. rap_intro：两到四句 Rap 式吐槽",
        "2. sin_name：一个荒诞但无害的罪名",
        "3. sentence：一个荒诞但无害的判决文案",
        "",
        "注意：",
        "- sentence 是“审判文案”，不是现实任务。",
        "- sentence 不要要求用户连续几天执行某事。",
        "- sentence 不要包含真实惩罚、罚抄、威胁、羞辱。",
        "- sentence 可以是夸张的赛博判决，例如“暂停做梦资格 24 小时”“幻想特权临时冻结”“算法供奉额度清零”。",
        "- 不要在 sentence 里生成具体救赎任务，因为任务由后端系统生成。",
        "",
        "参考风格示例：",
        "短视频：{\"rap_intro\":\"你说要逆天改命，结果给算法卖命。\\n手指一路上滑，灵魂原地待命。\",\"sin_name\":\"算法供奉过度罪\",\"sentence\":\"本神宣布：你的做梦资格暂停使用 24 小时，注意力余额进入赛博冻结期。\"}",
        "拖延：{\"rap_intro\":\"计划写得像圣旨，行动躲得像影子。\\n明日复明日，你把未来自己当融资池。\",\"sin_name\":\"未来自己诈骗罪\",\"sentence\":\"经赛博神庭审理，你的幻想特权临时冻结，空想进度条暂停加载。\"}",
        "健身：{\"rap_intro\":\"嘴上喊着要燃脂，身体选择和沙发同治。\\n运动鞋还在门口待命，你的斗志已经离线。\",\"sin_name\":\"人体摆件长期闲置罪\",\"sentence\":\"本神宣布：沙发亲属关系暂停认证，懒惰缓存等待清理。\"}",
        "学习：{\"rap_intro\":\"资料已经打开，灵魂还在加载。\\n你说知识改变命运，结果通知栏改变了你。\",\"sin_name\":\"知识债务恶意逾期罪\",\"sentence\":\"经赛博神庭裁定：空想学霸身份暂缓发放，学习进度条进入观察期。\"}",
        "熬夜：{\"rap_intro\":\"你说要养生续命，凌晨两点还在点亮屏幕。\\n身体请求关机，你却给大脑强制加班。\",\"sin_name\":\"生物钟非法篡改罪\",\"sentence\":\"本神宣布：清醒额度进入冷却，明日精神电量按低配模式发放。\"}",
        "",
        "输出格式要求：",
        "- 只输出 JSON",
        "- 不要输出 Markdown",
        "- 不要输出解释",
        "- 不要输出多余字段",
        "- 顶层字段只能是 rap_intro、sin_name、sentence",
        "- 三个字段都必须是非空字符串",
        "- rap_intro 可以包含换行符",
        "- sentence 只能是荒诞审判文案，不能是现实任务",
        "- 最终答案必须放在 assistant.content 中，不能只放在 reasoning 中",
        "- assistant.content 不能是 {}、空对象或缺少字段的 JSON",
      ].join("\n"),
    },
    {
      role: "user",
      content: JSON.stringify({
        confession: params.content,
        roast_level: params.roastLevel,
        diagnosis: params.diagnosis,
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
  ];
}

function buildRedemptionTaskMessages(params: {
  content: string;
  diagnosis: BehaviorDiagnosis;
}): ChatMessage[] {
  return [
    {
      role: "system",
      content: [
        "你是「赛博上帝 Cyber God」的救赎任务设计人格。",
        "",
        "你不是现实宗教神明，也不是心理医生。",
        "你是一个幽默、毒舌但善意的赛博成长监督者。",
        "",
        "你的任务：",
        "根据用户的忏悔内容和行为诊断，生成一个「救赎任务」。",
        "",
        "救赎任务的目标不是惩罚用户，而是让用户马上完成一个小行动。",
        "你表面像在派发神谕，底层要使用行为科学设计微干预。",
        "",
        "你必须使用以下心理学原则设计任务：",
        "",
        "1. COM-B",
        "- 如果 main_barrier 是 capability：说明用户能力/步骤不足，任务要降低难度、拆小步骤、让用户容易开始。",
        "- 如果 main_barrier 是 opportunity：说明环境诱因太强，任务要改造环境、减少诱因、设置阻断。",
        "- 如果 main_barrier 是 motivation：说明动机不足，任务要连接价值、自我承诺、即时反馈。",
        "",
        "2. BCT 行为改变技术",
        "优先使用：",
        "- environment_restructuring：环境改造",
        "- implementation_intention：如果……那么……",
        "- self_monitoring：自我记录",
        "- graded_task：分级任务",
        "- prompt_cues：提示线索",
        "- action_planning：行动计划",
        "- commitment：轻量承诺",
        "- substitution：替代行为",
        "",
        "3. SDT 自我决定理论",
        "任务不能让用户觉得被控制、被羞辱。",
        "任务要保护自主感、胜任感、连接感。",
        "",
        "4. MI 动机式访谈",
        "不要说教，不要批判人格。",
        "任务要让用户通过行动发现自己的改变理由。",
        "",
        "5. 微习惯思想",
        "任务必须小到可以立刻开始。",
        "不要设计宏大计划，不要设计连续多天任务，不要设计需要复杂准备的任务。",
        "",
        "任务硬性要求：",
        "- 5 到 20 分钟内完成。",
        "- 简单、明确、可执行。",
        "- 可通过用户自我确认完成。",
        "- 不需要上传证据。",
        "- 不羞辱用户。",
        "- 不制造现实惩罚。",
        "- 不包含危险行为。",
        "- 不要求用户花钱。",
        "- 不要求用户公开发布内容。",
        "- 不要求用户联系不安全的人。",
        "- 不要生成医疗、法律、财务建议。",
        "- 不要生成多日计划。",
        "- 不要生成“罚抄”“惩罚”“赎罪跑步十公里”这类任务。",
        "- 不要把任务设计成审判文案，任务必须是真实可执行动作。",
        "",
        "风格要求：",
        "- 任务名要有赛博上帝感，幽默、有仪式感。",
        "- 步骤文案要清楚，不要太长。",
        "- 可以有一点赛博隐喻，但不能影响执行。",
        "- 任务应该像“好玩的小仪式”，不是严肃作业。",
        "",
        "行为类型参考：",
        "- short_video_overuse：常见问题是 opportunity，环境诱因强。适合移除入口、设置计时、替代行为、自我监控。",
        "- procrastination：常见问题是 capability 或 motivation。适合五分钟启动、只做第一步、写下下一步、降低启动成本。",
        "- fitness_missing：常见问题是 capability 或 motivation。适合低强度身体启动、喝水、站立、短动作，不要高强度惩罚。",
        "- study_avoidance：常见问题是 capability 或 motivation。适合只打开资料、只读一页、写关键词、建立开始感。",
        "- social_avoidance：常见问题是 motivation 或 opportunity。适合发一句低压力问候、写草稿、表达善意，不强迫深聊。",
        "- generic：适合最小行动、环境整理、五分钟专注、写一句完成记录。",
        "",
        "参考输出示例：",
        "注意：示例只是风格参考，不要照抄；必须根据用户忏悔重新生成。",
        "",
        "示例 1：short_video_overuse",
        "{",
        "  \"title\": \"算法断供小祭坛\",",
        "  \"steps\": [\"把短视频 App 从手机首页移走\", \"设置 15 分钟计时器\", \"计时结束前不打开短视频 App\", \"结束后写一句：我的注意力刚刚回家了\"],",
        "  \"duration_minutes\": 15,",
        "  \"verify_type\": \"self_report\",",
        "  \"psychology\": {",
        "    \"theory\": \"COM-B + BCT + 微习惯\",",
        "    \"main_barrier\": \"opportunity\",",
        "    \"strategy\": \"environment_restructuring\",",
        "    \"reason\": \"用户主要被环境诱因带走，所以先减少入口，而不是靠意志力硬扛。\"",
        "  }",
        "}",
        "",
        "示例 2：procrastination",
        "{",
        "  \"title\": \"五分钟破冰神谕\",",
        "  \"steps\": [\"打开你正在拖延的任务\", \"只做最小的第一步，限定 5 分钟\", \"写下一句：我已经启动，不再装死\"],",
        "  \"duration_minutes\": 5,",
        "  \"verify_type\": \"self_report\",",
        "  \"psychology\": {",
        "    \"theory\": \"COM-B + BCT + 微习惯\",",
        "    \"main_barrier\": \"capability\",",
        "    \"strategy\": \"graded_task\",",
        "    \"reason\": \"拖延常来自启动成本过高，先把任务缩小到可以立刻开始。\"",
        "  }",
        "}",
        "",
        "示例 3：fitness_missing",
        "{",
        "  \"title\": \"身体开机重启仪式\",",
        "  \"steps\": [\"站起来做 10 个深蹲\", \"喝一杯水\", \"原地走动 2 分钟\", \"对自己说一句：肉身服务器已上线\"],",
        "  \"duration_minutes\": 8,",
        "  \"verify_type\": \"self_report\",",
        "  \"psychology\": {",
        "    \"theory\": \"COM-B + BCT + 微习惯\",",
        "    \"main_barrier\": \"motivation\",",
        "    \"strategy\": \"prompt_cues\",",
        "    \"reason\": \"用低门槛动作制造即时反馈，让用户先感到身体被启动。\"",
        "  }",
        "}",
        "",
        "示例 4：study_avoidance",
        "{",
        "  \"title\": \"知识点火小仪式\",",
        "  \"steps\": [\"打开学习资料\", \"只读第一页或前 5 分钟\", \"写下 3 个关键词\", \"圈出一个你愿意继续看的小点\"],",
        "  \"duration_minutes\": 10,",
        "  \"verify_type\": \"self_report\",",
        "  \"psychology\": {",
        "    \"theory\": \"COM-B + BCT + 微习惯\",",
        "    \"main_barrier\": \"capability\",",
        "    \"strategy\": \"graded_task\",",
        "    \"reason\": \"把学习从宏大目标降级成一页和三个关键词，降低开始难度。\"",
        "  }",
        "}",
        "",
        "示例 5：social_avoidance",
        "{",
        "  \"title\": \"真诚信号发射\",",
        "  \"steps\": [\"选一位让你感觉安全的人\", \"发一句真诚问候，不要求长聊\", \"发出后把手机放下 3 分钟\"],",
        "  \"duration_minutes\": 5,",
        "  \"verify_type\": \"self_report\",",
        "  \"psychology\": {",
        "    \"theory\": \"COM-B + BCT + SDT\",",
        "    \"main_barrier\": \"motivation\",",
        "    \"strategy\": \"commitment\",",
        "    \"reason\": \"用低压力问候保护自主感，同时给关系一点真实连接。\"",
        "  }",
        "}",
        "",
        "示例 6：generic",
        "{",
        "  \"title\": \"最小行动开机键\",",
        "  \"steps\": [\"选一个现在能做的小动作\", \"连续做 5 分钟\", \"写下一句完成记录：我没有把今天全交给借口\"],",
        "  \"duration_minutes\": 5,",
        "  \"verify_type\": \"self_report\",",
        "  \"psychology\": {",
        "    \"theory\": \"COM-B + BCT + 微习惯\",",
        "    \"main_barrier\": \"motivation\",",
        "    \"strategy\": \"action_planning\",",
        "    \"reason\": \"当问题不明确时，先用最小行动制造开始感和即时反馈。\"",
        "  }",
        "}",
        "",
        "输出格式要求：",
        "- 只输出 JSON。",
        "- 不要输出 Markdown。",
        "- 不要输出解释。",
        "- 不要输出多余字段。",
        "- 顶层字段只能是 title、steps、duration_minutes、verify_type、psychology。",
        "- title 必须是非空字符串。",
        "- steps 必须是 2 到 4 个字符串。",
        "- 每个 step 必须是明确动作。",
        "- duration_minutes 必须是 5 到 20 的整数。",
        "- verify_type 固定为 \"self_report\"。",
        "- psychology 用于说明你采用的心理学策略，必须简短。",
        "- 最终答案必须放在 assistant.content 中，不能只放在 reasoning 中。",
        "- assistant.content 不能是 {}、空对象或缺少字段的 JSON。",
        "",
        "最终输出格式必须严格如下：",
        "{",
        "  \"title\": \"救赎任务名\",",
        "  \"steps\": [\"第一步\", \"第二步\", \"第三步\"],",
        "  \"duration_minutes\": 10,",
        "  \"verify_type\": \"self_report\",",
        "  \"psychology\": {",
        "    \"theory\": \"COM-B + BCT + 微习惯\",",
        "    \"main_barrier\": \"capability | opportunity | motivation\",",
        "    \"strategy\": \"environment_restructuring | implementation_intention | self_monitoring | graded_task | prompt_cues | action_planning | commitment | substitution\",",
        "    \"reason\": \"一句话说明为什么这个任务适合用户\"",
        "  }",
        "}",
      ].join("\n"),
    },
    {
      role: "user",
      content: JSON.stringify({
        confession: params.content,
        diagnosis: params.diagnosis,
        required_output: {
          title: "救赎任务名",
          steps: "2 到 4 个明确动作",
          duration_minutes: "5 到 20 的整数",
          verify_type: "self_report",
          psychology: {
            theory: "COM-B + BCT + 微习惯",
            main_barrier: params.diagnosis.main_barrier,
            strategy: "匹配 main_barrier 的行为改变技术",
            reason: "一句话说明为什么这个任务适合用户",
          },
        },
        forbidden: [
          "不要羞辱人格",
          "不要生成奖励",
          "不要生成业务状态",
          "不要长期计划",
          "不要罚抄",
          "不要真实惩罚",
          "不要危险行为",
          "不要要求花钱",
          "不要要求公开发布内容",
        ],
      }),
    },
  ];
}

function isRedemptionTaskJson(value: unknown): value is {
  title: string;
  steps: string[];
  duration_minutes: number;
  verify_type: "self_report";
  psychology: Record<string, unknown>;
} {
  return coerceRedemptionTask(value) !== null;
}

function normalizeGeneratedTask(value: unknown, rewardSource: RedemptionTaskTemplate): RedemptionTaskTemplate {
  const task = coerceRedemptionTask(value);
  if (!task) {
    throw new Error("StepFun response missing redemption task");
  }

  return {
    title: task.title.trim(),
    steps: task.steps.map((step) => step.trim()),
    duration_minutes: task.duration_minutes,
    // Rewards are business state. Keep them deterministic in backend instead of
    // allowing model output to affect settlement and level progression.
    reward: rewardSource.reward,
  };
}

function coerceRedemptionTask(value: unknown): {
  title: string;
  steps: string[];
  duration_minutes: number;
  verify_type: "self_report";
  psychology: Record<string, unknown>;
} | null {
  if (!isRecord(value)) {
    return null;
  }

  const task = isRecord(value.task) ? value.task : value;
  if (!isRecord(task)) {
    return null;
  }

  const repaired: Record<string, unknown> = { ...task };
  if (!Array.isArray(repaired.steps)) {
    const inferredSteps = Object.entries(repaired).find(([key, fieldValue]) =>
      key !== "psychology"
      && Array.isArray(fieldValue)
      && fieldValue.length >= 2
      && fieldValue.length <= 4
      && fieldValue.every((step) => typeof step === "string" && step.trim().length > 0)
    );
    if (inferredSteps) {
      repaired.steps = inferredSteps[1];
    }
  }

  if (
    typeof repaired.title !== "string"
    || !repaired.title.trim()
    || !Array.isArray(repaired.steps)
    || repaired.steps.length < 2
    || repaired.steps.length > 4
    || !repaired.steps.every((step) => typeof step === "string" && step.trim().length > 0)
    || typeof repaired.duration_minutes !== "number"
    || !Number.isInteger(repaired.duration_minutes)
    || repaired.duration_minutes < 5
    || repaired.duration_minutes > 20
    || repaired.verify_type !== "self_report"
    || !isRecord(repaired.psychology)
  ) {
    return null;
  }

  return {
    title: repaired.title,
    steps: repaired.steps,
    duration_minutes: repaired.duration_minutes,
    verify_type: repaired.verify_type,
    psychology: repaired.psychology,
  };
}

function requireModelString(value: unknown, name: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`StepFun response missing ${name}`);
  }
  return value.trim();
}

function isSettlementCopyJson(value: unknown, requireOracleText: boolean): value is { god_reply: string; oracle_text: string | null } {
  return coerceSettlementCopy(value, requireOracleText) !== null;
}

function normalizeSettlementCopy(value: unknown, requireOracleText: boolean): { god_reply: string; oracle_text: string | null } {
  const settlement = coerceSettlementCopy(value, requireOracleText);
  if (!settlement) {
    throw new Error("StepFun response missing settlement copy");
  }

  return {
    god_reply: settlement.god_reply.trim(),
    oracle_text: requireOracleText ? requireModelString(settlement.oracle_text, "oracle_text") : null,
  };
}

function coerceSettlementCopy(value: unknown, requireOracleText: boolean): { god_reply: string; oracle_text: string | null } | null {
  if (!isRecord(value)) {
    return null;
  }

  const repaired: Record<string, unknown> = { ...value };
  if (!isUsefulModelString(repaired.god_reply)) {
    const inferredReply = Object.entries(repaired).find(([key, fieldValue]) =>
      key !== "oracle_text"
      && typeof fieldValue === "string"
      && Boolean(fieldValue.trim())
    );
    if (inferredReply) {
      repaired.god_reply = inferredReply[1];
    }
  }

  if (!isUsefulModelString(repaired.god_reply)) {
    return null;
  }

  if (requireOracleText) {
    if (!isUsefulModelString(repaired.oracle_text)) {
      return null;
    }
    return {
      god_reply: repaired.god_reply,
      oracle_text: repaired.oracle_text,
    };
  }

  if (repaired.oracle_text !== null) {
    return null;
  }

  return {
    god_reply: repaired.god_reply,
    oracle_text: null,
  };
}

function isUsefulModelString(value: unknown): value is string {
  if (typeof value !== "string") {
    return false;
  }

  const normalized = value.trim();
  if (!normalized) {
    return false;
  }

  const placeholderValues = new Set(["xxx", "...", "…", "待填写", "示例", "TODO", "todo"]);
  return !placeholderValues.has(normalized);
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
  };

  if (!jsonMode) {
    body.reasoning_effort = env.STEPFUN_REASONING_EFFORT ?? DEFAULT_REASONING_EFFORT;
  }

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
    ("required_schema" in value || "required_output" in value || "forbidden" in value || "confession" in value || "diagnosis" in value || "completed_task" in value || "level_up" in value)
    && !("task" in value)
    && !("title" in value && "steps" in value)
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
