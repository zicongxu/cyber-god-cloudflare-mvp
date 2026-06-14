# GodChat 前端原型实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 实现一个 Web 承载、移动端 App 风格的单页原型页，支持忏悔、审判、完成仪式、降级任务、确认结算和流程恢复。

**Architecture:** 采用轻量模块化拆分：`index.html` 只负责挂载，`src/app.js` 负责编排，`src/state.js` 负责会话状态和本地持久化，`src/api.js` 负责协议请求，`src/render.js` 负责聊天流和卡片渲染，`src/styles.css` 负责移动端 App 风格。所有业务流程按 `api-protocol` 的状态机串联，前端额外支持 `restoring` 状态用于刷新恢复。

**Tech Stack:** 原生 HTML/CSS/JavaScript，浏览器 Fetch API，`localStorage`，Cloudflare Worker 后端协议，移动端窄屏响应式布局。

---

## 计划范围检查

- 已覆盖：页面壳层、聊天流、任务卡、完成仪式、降级任务、结算卡、档案摘要、刷新恢复、错误处理。
- 已排除：登录、历史时间线完整列表、多人共享、复杂路由、后端改造。
- 依赖文档：`docs/api-protocol.md`、`frontend/2026-06-14-godchat-web-chat-design.md`、`docs/superpowers/specs/2026-06-14-godchat-frontend-implementation-architecture.md`。

## 文件结构

- `frontend/index.html`
  - 只保留根容器和脚本加载入口。
- `frontend/src/app.js`
  - 启动、恢复、事件编排、状态驱动渲染。
- `frontend/src/state.js`
  - 管理 `flowId`、`taskId`、`status`、`messages`、`profile`、`loading`、`error`，并同步到本地存储。
- `frontend/src/api.js`
  - 封装协议接口，统一请求头和错误转换。
- `frontend/src/render.js`
  - 把当前状态渲染成移动端 App 风格界面。
- `frontend/src/styles.css`
  - 负责 App 壳层、消息流、卡片、底部输入栏、响应式和安全区。

---

### Task 1: 搭建 App 壳层与模块入口

**Files:**
- Modify: `frontend/index.html`
- Create: `frontend/src/app.js`
- Create: `frontend/src/styles.css`

- [ ] **Step 1: 写出最小可运行壳层**

```html
<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
    <title>GodChat</title>
    <link rel="stylesheet" href="./src/styles.css" />
    <script type="module" src="./src/app.js"></script>
  </head>
  <body>
    <div id="app"></div>
  </body>
</html>
```

- [ ] **Step 2: 写出入口启动逻辑**

```js
import { createApp } from "./app.js";

createApp(document.querySelector("#app"));
```

- [ ] **Step 3: 写出 App 外壳样式**

```css
:root {
  color-scheme: dark;
  font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  background: #0f1115;
  color: #f4efe4;
}

* {
  box-sizing: border-box;
}

body {
  margin: 0;
  min-height: 100vh;
  background:
    radial-gradient(circle at top, rgba(255, 195, 92, 0.16), transparent 35%),
    linear-gradient(180deg, #11131a 0%, #0c0e12 100%);
}

#app {
  min-height: 100vh;
}
```

- [ ] **Step 4: 验证页面能独立打开**

Run: `python3 -m http.server 4173 -d frontend`

Expected: 浏览器打开 `http://localhost:4173` 后能看到 `#app` 容器，控制台无模块加载错误。

- [ ] **Step 5: 提交**

```bash
git add frontend/index.html frontend/src/app.js frontend/src/styles.css
git commit -m "feat: scaffold godchat frontend app shell"
```

---

### Task 2: 实现状态层与接口层

**Files:**
- Create: `frontend/src/state.js`
- Create: `frontend/src/api.js`
- Modify: `frontend/src/app.js`

- [ ] **Step 1: 写出状态存取接口**

```js
const STORAGE_KEY = "godchat.flow";

export function loadFlowState() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    return { flowId: null, taskId: null, status: "restoring", messages: [], profile: null, loading: false, error: null };
  }
  try {
    return JSON.parse(raw);
  } catch {
    localStorage.removeItem(STORAGE_KEY);
    return { flowId: null, taskId: null, status: "restoring", messages: [], profile: null, loading: false, error: null };
  }
}

export function saveFlowState(state) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}
```

- [ ] **Step 2: 写出协议封装**

```js
async function request(apiBase, path, body) {
  const response = await fetch(`${apiBase}${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-user-id": "demo_user",
    },
    body: JSON.stringify(body),
  });
  const json = await response.json();
  if (json.code !== 0) {
    throw Object.assign(new Error(json.message), { code: json.code, data: json.data });
  }
  return json.data;
}

async function requestGet(apiBase, path) {
  const response = await fetch(`${apiBase}${path}`, {
    headers: {
      "x-user-id": "demo_user",
    },
  });
  const json = await response.json();
  if (json.code !== 0) {
    throw Object.assign(new Error(json.message), { code: json.code, data: json.data });
  }
  return json.data;
}
```

- [ ] **Step 3: 按协议补齐接口函数**

```js
export function createApiClient(apiBase) {
  return {
    createConfessionFlow: (payload) => request(apiBase, "/api/v1/confession-flows", payload),
    getConfessionFlow: (flowId) => requestGet(apiBase, `/api/v1/confession-flows/${flowId}`),
    startCompletionRitual: (taskId, payload) => request(apiBase, `/api/v1/tasks/${taskId}/completion-ritual`, payload),
    downgradeTask: (taskId, payload) => request(apiBase, `/api/v1/tasks/${taskId}/downgrade`, payload),
    selfConfirmTask: (taskId, payload) => request(apiBase, `/api/v1/tasks/${taskId}/self-confirm`, payload),
    settleTask: (taskId, payload) => request(apiBase, `/api/v1/tasks/${taskId}/settle`, payload),
    getProfile: () => requestGet(apiBase, "/api/v1/users/me/profile"),
  };
}
```

- [ ] **Step 4: 把 app.js 接到状态和接口层**

```js
import { createApiClient } from "./api.js";
import { loadFlowState, saveFlowState } from "./state.js";

export function createApp(root) {
  const state = loadFlowState();
  saveFlowState(state);
  root.textContent = "GodChat app shell ready.";
  return { state };
}
```

- [ ] **Step 5: 验证本地存储和接口函数能被导入**

Run: `node --input-type=module -e 'import("./frontend/src/state.js").then(() => console.log("state ok"))'`

Expected: 输出 `state ok`。

- [ ] **Step 6: 提交**

```bash
git add frontend/src/state.js frontend/src/api.js frontend/src/app.js
git commit -m "feat: add frontend state and api layers"
```

---

### Task 3: 实现聊天流渲染与移动端卡片

**Files:**
- Create: `frontend/src/render.js`
- Modify: `frontend/src/app.js`
- Modify: `frontend/src/styles.css`

- [ ] **Step 1: 写出渲染入口**

```js
function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function renderApp(root, state, actions) {
  root.innerHTML = `
    <main class="app-shell">
      <header class="app-bar">GodChat</header>
      <section class="chat-feed">
        ${state.messages.map(renderMessage).join("")}
      </section>
      <form class="composer">
        <input name="confession" placeholder="向上帝忏悔..." value="${escapeHtml(state.draft ?? "")}" />
        <button type="submit">发送</button>
      </form>
    </main>
  `;
}
```

- [ ] **Step 2: 写出消息和卡片渲染函数**

```js
function renderMessage(message) {
  if (message.type === "task-card") return `<article class="card task-card">${escapeHtml(message.title)}</article>`;
  if (message.type === "ritual-card") return `<article class="card ritual-card">${escapeHtml(message.title)}</article>`;
  if (message.type === "settlement-card") return `<article class="card settlement-card">${escapeHtml(message.title)}</article>`;
  return `<article class="bubble bubble-${message.role}">${escapeHtml(message.content)}</article>`;
}
```

- [ ] **Step 3: 补齐 App 风格样式**

```css
.app-shell {
  width: min(430px, 100%);
  min-height: 100vh;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  padding: 12px 12px calc(12px + env(safe-area-inset-bottom));
}

.app-bar {
  position: sticky;
  top: 0;
  z-index: 2;
  padding: 14px 16px;
  border-radius: 24px;
  background: rgba(20, 22, 30, 0.92);
  backdrop-filter: blur(18px);
}

.chat-feed {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 14px 0;
}

.composer {
  position: sticky;
  bottom: 0;
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 10px;
  padding: 12px;
  border-radius: 22px;
  background: rgba(16, 18, 24, 0.96);
}
```

- [ ] **Step 4: 让按钮/卡片渲染进消息流**

```js
const messages = [
  { role: "system", type: "text", content: "欢迎来到忏悔舱。" },
  { role: "god", type: "text", content: "说吧，今天又想怎么坑未来的你。" },
];
```

- [ ] **Step 5: 验证卡片和气泡在窄屏下不溢出**

Run: `python3 -m http.server 4173 -d frontend`

Expected: 430px 宽度下聊天流单列显示，底部输入栏固定，卡片可正常换行。

- [ ] **Step 6: 提交**

```bash
git add frontend/src/render.js frontend/src/app.js frontend/src/styles.css
git commit -m "feat: render godchat chat feed"
```

---

### Task 4: 打通完整流程与恢复逻辑

**Files:**
- Modify: `frontend/src/app.js`
- Modify: `frontend/src/render.js`
- Modify: `frontend/src/state.js`

- [ ] **Step 1: 写出启动恢复流程**

```js
async function restoreFlow(api, state) {
  if (!state.flowId) return state;
  const data = await api.getConfessionFlow(state.flowId);
  return { ...state, status: data.status, taskId: data.task?.task_id ?? null, loadedFlow: data };
}
```

- [ ] **Step 2: 写出忏悔、完成仪式、降级、确认、结算动作**

```js
async function submitConfession(api, state, content) {
  const data = await api.createConfessionFlow({ content, roast_level: 3 });
  return {
    ...state,
    flowId: data.flow_id,
    taskId: data.task.task_id,
    status: data.status,
    messages: [
      ...state.messages,
      { type: "user-confession", role: "user", content },
      { type: "god-judgement", role: "god", content: data.judgement.rap_intro },
      { type: "task-card", role: "system", title: data.task.title, steps: data.task.steps, taskId: data.task.task_id },
    ],
  };
}

async function startRitual(api, state) {
  const data = await api.startCompletionRitual(state.taskId, { flow_id: state.flowId });
  return { ...state, status: data.status, ritual: data.ritual };
}

async function downgrade(api, state) {
  const data = await api.downgradeTask(state.taskId, { flow_id: state.flowId, reason: "not_completed" });
  return {
    ...state,
    taskId: data.task.task_id,
    status: data.status,
    messages: [
      ...state.messages,
      { type: "system-note", role: "system", content: data.message },
      { type: "task-card", role: "system", title: data.task.title, steps: data.task.steps, taskId: data.task.task_id },
    ],
  };
}

async function selfConfirm(api, state) {
  const data = await api.selfConfirmTask(state.taskId, {
    flow_id: state.flowId,
    witness: { witness_type: "text", content: "我已完成。" },
    self_confirmation_text: "我确认：这次救赎，我没有糊弄自己。",
  });
  return { ...state, status: data.status, witnessId: data.witness_id };
}

async function settle(api, state) {
  const data = await api.settleTask(state.taskId, { flow_id: state.flowId });
  return {
    ...state,
    status: data.status,
    settlement: data.settlement,
    oracle: data.oracle,
    messages: [
      ...state.messages,
      { type: "settlement-card", role: "system", title: "结算完成", content: data.god_reply },
    ],
  };
}
```

- [ ] **Step 3: 把动作结果写回消息流**

```js
function appendMessage(state, message) {
  return { ...state, messages: [...state.messages, message] };
}
```

- [ ] **Step 4: 把恢复失败和业务错误做成可展示提示**

```js
function normalizeError(error) {
  return {
    code: error.code ?? 50000,
    message: error.message ?? "internal error",
    data: error.data ?? {},
  };
}
```

- [ ] **Step 5: 补齐档案摘要卡**

```js
async function loadProfile(api) {
  const profile = await api.getProfile();
  return {
    title: `灵魂档案 · Lv.${profile.level}`,
    content: `完成 ${profile.stats.completed_tasks} 次，失败 ${profile.stats.failed_tasks} 次`,
  };
}
```

- [ ] **Step 6: 验证完整闭环**

Run: `python3 -m http.server 4173 -d frontend`

Expected:
- 提交忏悔后出现审判与任务卡。
- 点击完成仪式后能进入完成/未完成分支。
- 结算后出现奖励与神谕。
- 刷新后可以恢复当前 `flow_id`。

- [ ] **Step 7: 提交**

```bash
git add frontend/src/app.js frontend/src/render.js frontend/src/state.js
git commit -m "feat: wire godchat full flow"
```

---

## 自检清单

- [ ] 每个任务都有明确文件边界。
- [ ] 每个流程节点都能映射到 `api-protocol`。
- [ ] 没有把历史时间线当成已存在接口。
- [ ] 没有把单文件原型误写成完整工程化拆分。
- [ ] 计划可以独立产出可运行原型页。
