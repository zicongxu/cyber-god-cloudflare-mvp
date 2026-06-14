#!/usr/bin/env node
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { homedir } from "node:os";
import { join } from "node:path";
import { existsSync, readFileSync, writeFileSync } from "node:fs";

const VERSION = "0.1.0";
const DEFAULT_BASE_URL = "http://localhost:8787";
const STATE_PATH = join(homedir(), ".cyber-god-cli-state.json");
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const c = {
  reset: "\x1b[0m",
  dim: "\x1b[2m",
  bold: "\x1b[1m",
  black: "\x1b[30m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  magenta: "\x1b[35m",
  cyan: "\x1b[36m",
  white: "\x1b[37m",
  gray: "\x1b[90m",
  bgMagenta: "\x1b[45m",
  bgCyan: "\x1b[46m",
};

function paint(color, value) {
  return `${color}${value}${c.reset}`;
}

function stripAnsi(value) {
  return String(value).replace(/\x1b\[[0-9;]*m/g, "");
}

function charWidth(char) {
  const code = char.codePointAt(0) ?? 0;
  if (code === 0) return 0;
  if (code < 32 || (code >= 0x7f && code < 0xa0)) return 0;
  if (
    (code >= 0x0300 && code <= 0x036f) ||
    (code >= 0x1ab0 && code <= 0x1aff) ||
    (code >= 0x1dc0 && code <= 0x1dff) ||
    (code >= 0x20d0 && code <= 0x20ff) ||
    (code >= 0xfe20 && code <= 0xfe2f)
  ) return 0;
  if (
    (code >= 0x1100 && code <= 0x115f) ||
    code === 0x2329 || code === 0x232a ||
    (code >= 0x2e80 && code <= 0xa4cf) ||
    (code >= 0xac00 && code <= 0xd7a3) ||
    (code >= 0xf900 && code <= 0xfaff) ||
    (code >= 0xfe10 && code <= 0xfe19) ||
    (code >= 0xfe30 && code <= 0xfe6f) ||
    (code >= 0xff00 && code <= 0xff60) ||
    (code >= 0xffe0 && code <= 0xffe6) ||
    (code >= 0x1f300 && code <= 0x1faff)
  ) return 2;
  return 1;
}

function visibleLength(value) {
  return [...stripAnsi(value)].reduce((sum, char) => sum + charWidth(char), 0);
}

function padVisible(value, width) {
  const gap = Math.max(0, width - visibleLength(value));
  return `${value}${" ".repeat(gap)}`;
}

function sliceVisiblePlain(value, width) {
  let out = "";
  let used = 0;
  for (const char of String(value)) {
    const next = used + charWidth(char);
    if (next > width) break;
    out += char;
    used = next;
  }
  return { text: out, width: used };
}

function wrapPlain(value, width) {
  const text = String(value);
  const lines = [];
  let current = "";
  let used = 0;
  for (const char of text) {
    if (char === "\n") {
      lines.push(current);
      current = "";
      used = 0;
      continue;
    }
    const w = charWidth(char);
    if (used > 0 && used + w > width) {
      lines.push(current.trimEnd());
      current = "";
      used = 0;
      if (/\s/.test(char)) continue;
    }
    current += char;
    used += w;
  }
  lines.push(current.trimEnd());
  return lines.length ? lines : [""];
}

function wrapLine(value, width) {
  const line = String(value ?? "");
  if (visibleLength(line) <= width) return [line];
  // For long rows, drop embedded ANSI so wrapping never corrupts color state.
  return wrapPlain(stripAnsi(line), width);
}

function centerVisible(value, width) {
  const gap = Math.max(0, width - visibleLength(value));
  const left = Math.floor(gap / 2);
  return `${" ".repeat(left)}${value}${" ".repeat(gap - left)}`;
}

function loadState() {
  try {
    if (!existsSync(STATE_PATH)) return {};
    return JSON.parse(readFileSync(STATE_PATH, "utf8"));
  } catch {
    return {};
  }
}

function saveState(patch) {
  const next = { ...loadState(), ...patch, updated_at: new Date().toISOString() };
  writeFileSync(STATE_PATH, `${JSON.stringify(next, null, 2)}\n`);
  return next;
}

function parseArgs(argv) {
  const args = [...argv];
  const opts = {};
  const rest = [];
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === "--") {
      rest.push(...args.slice(i + 1));
      break;
    }
    if (arg.startsWith("--")) {
      const eq = arg.indexOf("=");
      if (eq > -1) {
        opts[arg.slice(2, eq)] = arg.slice(eq + 1);
      } else {
        const key = arg.slice(2);
        const next = args[i + 1];
        if (!next || next.startsWith("-")) {
          opts[key] = true;
        } else {
          opts[key] = next;
          i += 1;
        }
      }
    } else if (arg.startsWith("-") && arg.length > 1) {
      const key = arg.slice(1);
      const next = args[i + 1];
      if (!next || next.startsWith("-")) {
        opts[key] = true;
      } else {
        opts[key] = next;
        i += 1;
      }
    } else {
      rest.push(arg);
    }
  }
  return { command: rest[0] ?? "help", positionals: rest.slice(1), opts };
}

function context(opts = {}) {
  const state = loadState();
  const baseUrl = String(opts.url || process.env.CYBER_GOD_URL || state.base_url || DEFAULT_BASE_URL).replace(/\/$/, "");
  const userId = String(opts.user || opts.u || process.env.CYBER_GOD_USER_ID || state.user_id || "mortal_cli");
  if (opts.url || opts.user || opts.u) saveState({ base_url: baseUrl, user_id: userId });
  return { baseUrl, userId, state };
}

async function request(path, { method = "GET", body, userId, baseUrl } = {}) {
  const res = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      "content-type": "application/json",
      "x-user-id": userId,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  const json = text ? JSON.parse(text) : null;
  if (!res.ok || json?.code !== 0) {
    const err = new Error(json?.message || `HTTP ${res.status}`);
    err.status = res.status;
    err.payload = json;
    throw err;
  }
  return json.data;
}

async function withSpinner(label, task) {
  if (!output.isTTY) return task();
  const frames = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
  let i = 0;
  const timer = setInterval(() => {
    output.write(`\r${paint(c.cyan, frames[i++ % frames.length])} ${label}${paint(c.gray, " ...")}`);
  }, 80);
  try {
    const result = await task();
    clearInterval(timer);
    output.write(`\r${paint(c.green, "◆")} ${label}${paint(c.gray, " done")}\n`);
    return result;
  } catch (error) {
    clearInterval(timer);
    output.write(`\r${paint(c.red, "◆")} ${label}${paint(c.gray, " failed")}\n`);
    throw error;
  }
}

async function typewrite(text, speed = 8) {
  if (!output.isTTY || process.env.NO_ANIMATION) {
    console.log(text);
    return;
  }
  for (const char of String(text)) {
    output.write(char);
    await sleep(speed);
  }
  output.write("\n");
}

const stage = {
  portal: c.cyan,
  flow: c.blue,
  judgement: c.yellow,
  task: c.magenta,
  ritual: c.cyan,
  confirm: c.green,
  settle: c.green,
  oracle: c.magenta,
  downgrade: c.red,
  profile: c.cyan,
};

const SLOW_LINE_MS = Number(process.env.CYBER_GOD_SLOW_MS ?? 180);
const SECTION_PAUSE_MS = Number(process.env.CYBER_GOD_SECTION_PAUSE_MS ?? 900);
const CYBER_GOD_ART = [
  "",
  "       ✻  Cyber God",
  "",
  "          judgement engine · online",
  "          oracle protocol  · ready",
  "",
];

function renderCyberGodArt() {
  for (const line of CYBER_GOD_ART) {
    if (!line) {
      console.log("");
      continue;
    }
    const color = line.includes("✻") ? c.magenta + c.bold : c.gray;
    console.log(paint(color, line));
  }
}

function banner() {
  const width = 56;
  const title = `${paint(c.bold + c.magenta, "C Y B E R   G O D")} ${paint(c.gray, "// confessional terminal")}`;
  const subtitle = `${paint(c.gray, `v${VERSION}`)}  ${paint(c.dim, "审判不是终点，行动才是救赎。")}`;
  console.log(paint(stage.portal, `╔${"═".repeat(width)}╗`));
  console.log(`${paint(stage.portal, "║")}${centerVisible(title, width)}${paint(stage.portal, "║")}`);
  console.log(`${paint(stage.portal, "║")}${centerVisible(subtitle, width)}${paint(stage.portal, "║")}`);
  console.log(paint(stage.portal, `╚${"═".repeat(width)}╝`));
  renderCyberGodArt();
}

function drawBoxLines(title, lines = [], color = c.cyan, options = {}) {
  const minWidth = options.minWidth ?? 38;
  const maxWidth = options.maxWidth ?? 76;
  const raw = lines.flatMap((line) => String(line ?? "").split("\n"));
  const wantedWidth = Math.max(minWidth, visibleLength(title) + 4, ...raw.map((line) => Math.min(maxWidth - 2, visibleLength(line) + 2)));
  const innerWidth = Math.min(maxWidth, wantedWidth);
  const textWidth = innerWidth - 2;
  const normalized = raw.flatMap((line) => wrapLine(line, textWidth));
  const topLabel = `─ ${title} `;
  return [
    paint(color, `┌${topLabel}${"─".repeat(Math.max(0, innerWidth - visibleLength(topLabel)))}┐`),
    ...normalized.map((line) => `${paint(color, "│")} ${padVisible(line, textWidth)} ${paint(color, "│")}`),
    paint(color, `└${"─".repeat(innerWidth)}┘`),
  ];
}

function box(title, lines = [], color = c.cyan, options = {}) {
  for (const line of drawBoxLines(title, lines, color, options)) console.log(line);
}

async function slowBox(title, lines = [], color = c.cyan, options = {}) {
  const rendered = drawBoxLines(title, lines, color, options);
  if (!output.isTTY || process.env.NO_ANIMATION) {
    for (const line of rendered) console.log(line);
    return;
  }
  for (const line of rendered) {
    console.log(line);
    await sleep(options.lineDelayMs ?? SLOW_LINE_MS);
  }
}

function kv(label, value, valueColor = c.white) {
  return `${paint(c.bold + c.white, padVisible(label, 12))} ${typeof value === "string" ? value : String(value)}`;
}

function field(label, value, wrapWidth = 56) {
  const labelWidth = 12;
  const rows = wrapPlain(stripAnsi(String(value ?? "-")), wrapWidth);
  const head = `${paint(c.bold + c.white, padVisible(label, labelWidth))} ${rows[0] ?? ""}`;
  const tail = rows.slice(1).map((row) => `${" ".repeat(labelWidth)} ${row}`);
  return [head, ...tail].join("\n");
}

function chip(label, color) {
  return paint(color + c.bold, label);
}

function rewardLine(reward = {}) {
  return [
    `智慧+${reward.wisdom ?? 0}`,
    `自律+${reward.discipline ?? 0}`,
    `勇气+${reward.courage ?? 0}`,
    `慈悲+${reward.compassion ?? 0}`,
    paint(c.yellow, `EXP+${reward.exp ?? 0}`),
  ].join("  ");
}

function bar(value, max, width = 24) {
  const ratio = max <= 0 ? 0 : Math.max(0, Math.min(1, value / max));
  const filled = Math.round(ratio * width);
  return `${paint(c.magenta, "█".repeat(filled))}${paint(c.gray, "░".repeat(width - filled))} ${value}/${max}`;
}

function taskLines(task) {
  return [
    kv("任务", paint(c.bold, task.title)),
    kv("时长", `${task.duration_minutes} 分钟`),
    kv("奖励", rewardLine(task.reward)),
    "",
    ...task.steps.map((step, i) => `${paint(c.magenta, `${i + 1}.`)} ${step}`),
    "",
    paint(c.gray, `task_id=${task.task_id}  status=${task.status}`),
  ];
}

async function showTask(task, options = {}) {
  if (options.slow) {
    await slowBox("救赎任务", taskLines(task), stage.task, { maxWidth: 76, lineDelayMs: options.lineDelayMs });
    return;
  }
  box("救赎任务", taskLines(task), stage.task, { maxWidth: 76 });
}

function judgementLines(data) {
  const judgement = data.judgement;
  return [
    paint(c.bold + c.white, "神经嘲讽"),
    `“${judgement.rap_intro}”`,
    "",
    kv("罪名", paint(c.bold + c.red, judgement.sin_name)),
    field("判词", judgement.sentence),
    data.diagnosis ? kv("诊断", `${data.diagnosis.behavior_type} / ${data.diagnosis.main_barrier}`) : null,
    data.agent ? kv("神经模型", `${data.agent.provider}${data.agent.model ? `:${data.agent.model}` : ""}${data.agent.fallback ? " (fallback)" : ""}`) : null,
  ].filter(Boolean);
}

async function showJudgement(data, options = {}) {
  if (options.slow) {
    await slowBox("审判结果", judgementLines(data), stage.judgement, { maxWidth: 76, lineDelayMs: options.lineDelayMs });
    return;
  }
  box("审判结果", judgementLines(data), stage.judgement, { maxWidth: 76 });
}

async function showJudgementThenTask(data) {
  await slowBox("审判结果", judgementLines(data), stage.judgement, { maxWidth: 76 });
  if (output.isTTY && !process.env.NO_ANIMATION) await sleep(SECTION_PAUSE_MS);
  await slowBox("救赎任务", taskLines(data.task), stage.task, { maxWidth: 76 });
}

function showProfile(profile) {
  const attrs = profile.attributes;
  box("灵魂档案", [
    `${chip("MORTAL", stage.profile)} ${paint(c.bold, profile.nickname)} ${paint(c.gray, `<${profile.user_id}>`)}`,
    "",
    `${paint(c.bold + c.white, "等级")} ${paint(c.bold + c.cyan, `Lv.${profile.level}`)}    ${paint(c.bold + c.white, "经验")} ${bar(profile.exp, profile.next_level_exp, 18)}`,
    "",
    `${paint(c.bold + c.white, "属性")}  ${paint(c.yellow, `智慧 ${attrs.wisdom}`)}  ${paint(c.green, `自律 ${attrs.discipline}`)}  ${paint(c.red, `勇气 ${attrs.courage}`)}  ${paint(c.magenta, `慈悲 ${attrs.compassion}`)}`,
    `${paint(c.bold + c.white, "战绩")}  ${paint(c.green, `完成 ${profile.stats.completed_tasks}`)}  /  ${paint(c.red, `失败 ${profile.stats.failed_tasks}`)}`,
  ], stage.profile, { maxWidth: 64 });
}

function help() {
  banner();
  console.log(`\n${paint(c.bold, "Usage")}: cyber-god <command> [options]\n`);
  console.log(`${paint(c.bold, "Core commands")}
  enter                         打开交互式赛博忏悔入口
  confess <内容>              创建忏悔审判流，并保存 flow/task
  ritual [--flow id] [--task id] 请求神明见证
  confirm <完成回执>             主动告知神明完成，并保存状态
  settle                        结算奖励 / 解锁神谕
  redeem <内容>                  一键：confess → ritual → confirm → settle
  downgrade                     未完成时生成 Tiny 任务
  flow [flow_id]                恢复当前或指定忏悔流
  profile                       查看灵魂档案
  health                        检查后端连通性
  chat [消息] [--stream]         心灵导师聊天；无消息则进入聊天模式
  config --url <url> --user <id> 保存默认后端和用户
`);
  console.log(`${paint(c.bold, "Global options")}
  --url http://localhost:8787    后端 Base URL，或 CYBER_GOD_URL
  --user mortal_cli              用户 ID，或 CYBER_GOD_USER_ID
`);
}

async function cmdConfig(opts) {
  const ctx = context(opts);
  saveState({ base_url: ctx.baseUrl, user_id: ctx.userId });
  box("入口配置已写入", [kv("Base URL", ctx.baseUrl), kv("User ID", ctx.userId), kv("State", STATE_PATH)], stage.confirm);
}

async function cmdHealth(opts) {
  const ctx = context(opts);
  const data = await withSpinner("连接赛博神殿", () => request("/api/v1/health", ctx));
  box("后端状态", [kv("status", paint(c.green, data.status)), kv("provider", data.agent_provider), kv("model", data.stepfun_model)], stage.confirm);
}

async function cmdProfile(opts) {
  const ctx = context(opts);
  const profile = await withSpinner("读取灵魂档案", () => request("/api/v1/users/me/profile", ctx));
  showProfile(profile);
}

async function confess(content, opts) {
  const ctx = context(opts);
  if (!content?.trim()) throw new Error("忏悔内容不能为空。例：cyber-god confess 我今天又拖延了");
  const data = await withSpinner("上传忏悔，等待神经审判", () => request("/api/v1/confession-flows", {
    ...ctx,
    method: "POST",
    body: { content: content.trim(), roast_level: 3 },
  }));
  saveState({ base_url: ctx.baseUrl, user_id: ctx.userId, flow_id: data.flow_id, task_id: data.task.task_id });
  await showJudgementThenTask(data);
  console.log(paint(c.gray, `已保存 flow_id=${data.flow_id}, task_id=${data.task.task_id}`));
  return data;
}

async function cmdFlow(flowId, opts) {
  const ctx = context(opts);
  const id = flowId || opts.flow || opts.f || ctx.state.flow_id;
  if (!id) throw new Error("没有 flow_id。先运行 cyber-god confess 或传入 cyber-god flow <flow_id>");
  const data = await withSpinner("恢复忏悔流", () => request(`/api/v1/confession-flows/${encodeURIComponent(id)}`, ctx));
  saveState({ base_url: ctx.baseUrl, user_id: ctx.userId, flow_id: data.flow_id, task_id: data.task?.task_id });
  box("忏悔流", [
    kv("flow", data.flow_id),
    kv("status", data.status),
    field("content", data.confession?.content ?? "-"),
    kv("behavior", data.confession?.behavior_type ?? "-"),
  ], stage.flow);
  if (data.judgement) await showJudgement({ judgement: data.judgement });
  if (data.task) await showTask(data.task);
  return data;
}

async function ritual(opts) {
  const ctx = context(opts);
  const flowId = opts.flow || opts.f || ctx.state.flow_id;
  const taskId = opts.task || opts.t || ctx.state.task_id;
  if (!flowId || !taskId) throw new Error("缺少 flow_id/task_id。先运行 cyber-god confess，或传 --flow/--task。");
  const data = await withSpinner("请求神明见证", () => request(`/api/v1/tasks/${encodeURIComponent(taskId)}/completion-ritual`, {
    ...ctx,
    method: "POST",
    body: { flow_id: flowId },
  }));
  saveState({ base_url: ctx.baseUrl, user_id: ctx.userId, flow_id: data.flow_id, task_id: data.task_id, status: data.status });
  box(data.ritual.title, [
    data.ritual.content,
    "",
    paint(stage.confirm, "下一步由你主动开口："),
    `${paint(c.green, "cyber-god confirm")} "神明，我诚实完成了……"`,
    `${paint(stage.downgrade, "cyber-god downgrade")}  如果你没有完成，就诚实请求更小的救赎任务`,
  ], stage.ritual);
  return data;
}

async function confirm(text, opts) {
  const ctx = context(opts);
  const flowId = opts.flow || opts.f || ctx.state.flow_id;
  const taskId = opts.task || opts.t || ctx.state.task_id;
  if (!flowId || !taskId) throw new Error("缺少 flow_id/task_id。先运行 cyber-god ritual，或传 --flow/--task。");
  if (!text?.trim()) throw new Error("完成回执不能为空。例：cyber-god confirm 神明，我诚实完成了，这次没有糊弄自己");
  const data = await withSpinner("写入自我确认", () => request(`/api/v1/tasks/${encodeURIComponent(taskId)}/self-confirm`, {
    ...ctx,
    method: "POST",
    body: {
      flow_id: flowId,
      witness: opts.witness ? { witness_type: "text", content: String(opts.witness) } : undefined,
      self_confirmation_text: text.trim(),
    },
  }));
  saveState({ base_url: ctx.baseUrl, user_id: ctx.userId, flow_id: data.flow_id, task_id: data.task_id, status: data.status, witness_id: data.witness_id });
  box("神明收到你的回执", [
    `${chip("CONFIRMED", stage.confirm)} ${paint(c.bold, data.status)}`,
    kv("witness", data.witness_id),
    "",
    paint(c.bold + c.white, "你的完成回执"),
    `“${stripAnsi(text.trim())}”`,
  ], stage.confirm, { maxWidth: 66 });
  return data;
}

async function settle(opts) {
  const ctx = context(opts);
  const flowId = opts.flow || opts.f || ctx.state.flow_id;
  const taskId = opts.task || opts.t || ctx.state.task_id;
  if (!flowId || !taskId) throw new Error("缺少 flow_id/task_id。先完成 confirm，或传 --flow/--task。");
  const data = await withSpinner("结算灵魂奖励", () => request(`/api/v1/tasks/${encodeURIComponent(taskId)}/settle`, {
    ...ctx,
    method: "POST",
    body: { flow_id: flowId },
  }));
  saveState({ base_url: ctx.baseUrl, user_id: ctx.userId, flow_id: data.flow_id, task_id: data.task_id, status: data.status });
  if (data.idempotent) {
    box("已经结算过", [kv("reward_event", data.reward_event_id), kv("status", data.status)], c.yellow);
    return data;
  }
  const lines = [
    `${chip("SETTLED", stage.settle)} ${paint(c.bold, data.status)}`,
    "",
    `${paint(c.bold + c.white, "等级")} ${data.settlement.before.level} ${paint(c.gray, "→")} ${paint(c.bold + c.cyan, data.settlement.after.level)}    ${paint(c.bold + c.white, "经验")} ${data.settlement.before.exp} ${paint(c.gray, "→")} ${paint(c.yellow, data.settlement.after.exp)}`,
    `${paint(c.bold + c.white, "奖励")} ${rewardLine(data.settlement.reward)}`,
    "",
    paint(c.bold + c.white, "神明回应"),
    `“${data.god_reply}”`,
  ];
  if (data.oracle?.unlocked) {
    lines.push("", paint(c.bold + c.magenta, "神谕已解锁"), `“${data.oracle.text}”`);
  }
  box("灵魂结算", lines, data.oracle?.unlocked ? stage.oracle : stage.settle, { maxWidth: 76 });
  return data;
}

async function downgrade(opts) {
  const ctx = context(opts);
  const flowId = opts.flow || opts.f || ctx.state.flow_id;
  const taskId = opts.task || opts.t || ctx.state.task_id;
  if (!flowId || !taskId) throw new Error("缺少 flow_id/task_id。先运行 cyber-god ritual，或传 --flow/--task。");
  const data = await withSpinner("诚实降级救赎任务", () => request(`/api/v1/tasks/${encodeURIComponent(taskId)}/downgrade`, {
    ...ctx,
    method: "POST",
    body: { flow_id: flowId },
  }));
  saveState({ base_url: ctx.baseUrl, user_id: ctx.userId, flow_id: data.flow_id, task_id: data.task.task_id, status: data.status });
  box("任务已降级", [paint(c.green, data.message), kv("previous", data.previous_task_id), kv("status", data.status)], stage.downgrade);
  await showTask(data.task, { slow: true });
  return data;
}

async function cmdRedeem(content, opts) {
  const data = await confess(content, opts);
  await ritual({ ...opts, flow: data.flow_id, task: data.task.task_id });
  const confirmation = opts.confirm || "我确认：这次救赎，我没有糊弄自己。";
  await confirm(confirmation, { ...opts, flow: data.flow_id, task: data.task.task_id });
  return settle({ ...opts, flow: data.flow_id, task: data.task.task_id });
}

async function readMultiline(rl, title) {
  console.log(paint(c.gray, `${title}。输入空行结束：`));
  const lines = [];
  while (true) {
    const line = await rl.question(paint(c.cyan, "│ "));
    if (!line.trim()) break;
    lines.push(line);
  }
  return lines.join("\n");
}

function isNotCompletedUtterance(text) {
  return /(^|[，。,.!！?？\s])(没|没有|还没|未|未能|不算|失败|放弃|做不到|not completed|failed)([，。,.!！?？\s]|$)/i.test(text);
}

async function cmdEnter(opts) {
  banner();
  const ctx = context(opts);
  console.log(paint(c.gray, `后端 ${ctx.baseUrl} · 用户 ${ctx.userId}\n`));
  const rl = createInterface({ input, output });
  try {
    await typewrite("神殿入口已打开。凡人，请提交一段今天最诚实的系统日志。", 10);
    const content = await readMultiline(rl, "忏悔内容");
    const flow = await confess(content, opts);
    const start = await rl.question(paint(c.magenta, "是否立刻请求神明见证？[Y/n] > "));
    if (start.trim().toLowerCase() === "n") return;
    await ritual({ ...opts, flow: flow.flow_id, task: flow.task.task_id });
    await typewrite("现在不是我问你，而是你主动向神明提交一段完成回执。", 10);
    const completionMessage = await rl.question(paint(stage.confirm, "你对神明说 > "));
    if (!completionMessage.trim()) {
      box("神明保持沉默", ["没有回执，就没有见证。你可以稍后运行 confirm 或 downgrade。"], stage.ritual);
      return;
    }
    if (isNotCompletedUtterance(completionMessage)) {
      await downgrade({ ...opts, flow: flow.flow_id, task: flow.task.task_id });
      return;
    }
    const witness = await rl.question(paint(stage.ritual, "补充见证文本（可空）> "));
    await confirm(completionMessage, {
      ...opts,
      flow: flow.flow_id,
      task: flow.task.task_id,
      witness,
    });
    await settle({ ...opts, flow: flow.flow_id, task: flow.task.task_id });
    await cmdProfile(opts);
  } finally {
    rl.close();
  }
}

function extractSseContent(chunk) {
  const lines = chunk.split(/\r?\n/);
  let out = "";
  for (const line of lines) {
    if (!line.startsWith("data:")) continue;
    const raw = line.slice(5).trim();
    if (!raw || raw === "[DONE]") continue;
    try {
      const json = JSON.parse(raw);
      out += json.choices?.[0]?.delta?.content ?? "";
    } catch {
      // Ignore non-JSON SSE data frames.
    }
  }
  return out;
}

async function streamChat(message, opts) {
  const ctx = context(opts);
  const res = await fetch(`${ctx.baseUrl}/api/v1/agent/chat-stream`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-user-id": ctx.userId },
    body: JSON.stringify({ messages: [{ role: "user", content: message }] }),
  });
  if (!res.ok || !res.body) {
    const text = await res.text();
    throw new Error(text || `HTTP ${res.status}`);
  }
  output.write(paint(c.magenta, "赛博导师 > "));
  const decoder = new TextDecoder();
  let buffer = "";
  for await (const chunk of res.body) {
    buffer += decoder.decode(chunk, { stream: true });
    const frames = buffer.split(/\r?\n\r?\n/);
    buffer = frames.pop() ?? "";
    for (const frame of frames) output.write(extractSseContent(frame));
  }
  buffer += decoder.decode();
  if (buffer) output.write(extractSseContent(buffer));
  output.write("\n");
}

async function cmdChat(message, opts) {
  const ctx = context(opts);
  if (message?.trim()) {
    if (opts.stream || opts.s) return streamChat(message.trim(), opts);
    const data = await withSpinner("连接心灵导师", () => request("/api/v1/agent/chat", {
      ...ctx,
      method: "POST",
      body: { messages: [{ role: "user", content: message.trim() }] },
    }));
    box("赛博导师", [data.message.content, "", kv("agent", `${data.agent.provider}:${data.agent.model}`)], c.magenta);
    return;
  }

  banner();
  console.log(paint(c.gray, "进入聊天模式，输入 /exit 退出。\n"));
  const rl = createInterface({ input, output });
  const messages = [];
  try {
    while (true) {
      const line = await rl.question(paint(c.cyan, "你 > "));
      if (["/exit", "/quit", "退出"].includes(line.trim())) break;
      if (!line.trim()) continue;
      messages.push({ role: "user", content: line.trim() });
      const data = await withSpinner("导师思考中", () => request("/api/v1/agent/chat", {
        ...ctx,
        method: "POST",
        body: { messages },
      }));
      messages.push(data.message);
      await typewrite(`${paint(c.magenta, "赛博导师 >")} ${data.message.content}`, 6);
    }
  } finally {
    rl.close();
  }
}

async function main() {
  const { command, positionals, opts } = parseArgs(process.argv.slice(2));
  try {
    switch (command) {
      case "help":
      case "--help":
      case "-h":
        help();
        break;
      case "version":
      case "--version":
      case "-v":
        console.log(VERSION);
        break;
      case "config":
        await cmdConfig(opts);
        break;
      case "health":
        await cmdHealth(opts);
        break;
      case "profile":
        await cmdProfile(opts);
        break;
      case "confess":
        await confess(positionals.join(" "), opts);
        break;
      case "flow":
        await cmdFlow(positionals[0], opts);
        break;
      case "ritual":
        await ritual(opts);
        break;
      case "confirm":
        await confirm(positionals.join(" "), opts);
        break;
      case "settle":
        await settle(opts);
        break;
      case "downgrade":
        await downgrade(opts);
        break;
      case "redeem":
        await cmdRedeem(positionals.join(" "), opts);
        break;
      case "enter":
      case "portal":
        await cmdEnter(opts);
        break;
      case "chat":
        await cmdChat(positionals.join(" "), opts);
        break;
      default:
        throw new Error(`未知命令：${command}。运行 cyber-god help 查看入口协议。`);
    }
  } catch (error) {
    const payload = error.payload ? `\n${paint(c.gray, JSON.stringify(error.payload, null, 2))}` : "";
    console.error(`${paint(c.red, "神殿拒绝访问：")} ${error.message}${payload}`);
    process.exitCode = 1;
  }
}

await main();
