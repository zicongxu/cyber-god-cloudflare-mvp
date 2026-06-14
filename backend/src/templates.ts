import type { JudgementResult, RedemptionTaskTemplate, Reward } from "./types";

const rewards = {
  shortVideo: { wisdom: 1, discipline: 2, courage: 0, compassion: 0, exp: 10 },
  procrastination: { wisdom: 1, discipline: 2, courage: 0, compassion: 0, exp: 10 },
  fitness: { wisdom: 0, discipline: 2, courage: 1, compassion: 0, exp: 10 },
  study: { wisdom: 2, discipline: 1, courage: 0, compassion: 0, exp: 10 },
  social: { wisdom: 0, discipline: 0, courage: 2, compassion: 1, exp: 10 },
  generic: { wisdom: 1, discipline: 1, courage: 0, compassion: 0, exp: 8 },
} satisfies Record<string, Reward>;

export function judgementFor(behaviorType: string, roastLevel: number): JudgementResult {
  const table: Record<string, Omit<JudgementResult, "roast_level">> = {
    short_video_overuse: {
      rap_intro: "你说要掌控人生，结果被算法牵着灵魂狂奔。\n四小时短视频刷到手酸，计划表在角落里自动关灯。",
      sin_name: "算法供奉过度罪",
      sentence: "经赛博神庭审理：你的注意力非法转让给推荐系统，今日幻想特权临时冻结，灵魂缓存进入清理模式。",
    },
    procrastination: {
      rap_intro: "计划写得像圣旨，行动躲得像影子。",
      sin_name: "未来自己诈骗罪",
      sentence: "明日复明日额度冻结 12 小时。",
    },
    fitness_missing: {
      rap_intro: "嘴上说要燃脂，身体选择和沙发同治。",
      sin_name: "人体摆件长期闲置罪",
      sentence: "沙发亲属关系暂停认证。",
    },
    study_avoidance: {
      rap_intro: "资料已经打开，灵魂还在加载。",
      sin_name: "知识债务恶意逾期罪",
      sentence: "空想学霸身份暂缓发放。",
    },
    social_avoidance: {
      rap_intro: "消息躺在对话框，你的勇气躲进草稿箱。",
      sin_name: "真诚问候非法拖欠罪",
      sentence: "社交能量余额进入观察期。",
    },
    generic: {
      rap_intro: "你不是没有机会，只是今天又让借口坐上主位。",
      sin_name: "行动力临时欠费罪",
      sentence: "幻想特权暂停使用 8 小时。",
    },
  };

  return { ...(table[behaviorType] ?? table.generic), roast_level: roastLevel };
}

export function taskFor(behaviorType: string): RedemptionTaskTemplate {
  const table: Record<string, RedemptionTaskTemplate> = {
    short_video_overuse: {
      title: "算法断供救赎仪式",
      steps: [
        "把短视频 App 从手机首页移走，藏进第二层文件夹",
        "设置 15 分钟计时器，计时结束前不打开短视频 App",
        "打开一个你原本该做的任务，只完成最小的一步",
        "写下一句：我的注意力刚刚从算法手里赎回来了",
      ],
      duration_minutes: 15,
      reward: rewards.shortVideo,
    },
    procrastination: {
      title: "五分钟破冰仪式",
      steps: ["打开你拖延的任务", "只做第一步", "写下一句：我已经开始了"],
      duration_minutes: 5,
      reward: rewards.procrastination,
    },
    fitness_missing: {
      title: "身体开机仪式",
      steps: ["做 10 个深蹲", "喝一杯水", "站起来走动 2 分钟"],
      duration_minutes: 8,
      reward: rewards.fitness,
    },
    study_avoidance: {
      title: "知识点火仪式",
      steps: ["打开学习资料", "只读第一页", "写下 3 个关键词"],
      duration_minutes: 10,
      reward: rewards.study,
    },
    social_avoidance: {
      title: "真诚信号发射",
      steps: ["选择一位朋友", "发一句真诚问候", "不要撤回"],
      duration_minutes: 5,
      reward: rewards.social,
    },
    generic: {
      title: "最小行动仪式",
      steps: ["选一个你能立刻做的小动作", "连续做 5 分钟", "写下一句完成记录"],
      duration_minutes: 5,
      reward: rewards.generic,
    },
  };

  return table[behaviorType] ?? table.generic;
}

export function tinyTask(): RedemptionTaskTemplate {
  return {
    title: "三分钟断供",
    steps: ["把手机扣在桌上", "设置 3 分钟计时器", "计时结束前不要碰手机"],
    duration_minutes: 3,
    reward: { wisdom: 0, discipline: 1, courage: 0, compassion: 0, exp: 3 },
  };
}

export function oracleFor(behaviorType: string): string {
  if (behaviorType === "short_video_overuse") {
    return "算法最懂你的欲望。\n但它从不负责你的未来。";
  }
  return "你不是没有时间。你只是把时间送给了别人设计的人生。";
}
