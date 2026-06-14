# 赛博上帝 MVP 前后端交互协议

> 本文档已按当前后端实现对齐。对应代码：
>
> - `backend/src/index.ts`
> - `backend/src/agent.ts`
> - `backend/src/state-machine.ts`
> - `backend/src/templates.ts`

## 0. 当前接口文档与真实实现的 Gap 结论

本次对照后端真实路由和返回结构后，发现并修正以下文档差异：

| 模块 | 原文档描述 | 当前真实实现 | 本文档处理 |
|---|---|---|---|
| StepFun 默认模型 | 示例里写 `step-3.5-flash` | 代码默认 `step-3.7-flash` | 已统一为 `step-3.7-flash` |
| StepFun Base URL | 旧配置示例可能使用 `/step_plan/v1` | 代码默认 `https://api.stepfun.com/v1` | 已补充说明 |
| 普通/流式聊天人格 | 原文档说前端需要自己传赛博上帝 system prompt | 当前后端会自动注入“心灵导师形态”人格 prompt，并合并前端 system | 已修正 |
| 普通/流式聊天定位 | 原文档示例偏“审判/任务” | 当前注入人格明确禁止审判、定罪、惩罚、任务派发 | 已修正为“心灵导师聊天” |
| 创建忏悔流 | 原文档说 StepFun 串行生成审判和任务 | 当前 StepFun 并发生成审判文案和任务文案；奖励仍由本地模板决定 | 已修正 |
| 降级任务状态 | 原文档写返回 `waiting_completion` | 当前代码返回 `downgraded_task_assigned`，但新任务自身状态是 `waiting_completion` | 已按实现补充，并标注流程注意点 |
| 神谕获取 | 原文档有结算示例，但不够明确 | 神谕只在 `/settle` 返回；升级才解锁 | 已补充 |
| 错误信息 | 原文档错误码较粗 | 真实错误 message 更具体，如 `content is required`、`messages is required` | 已补充常见错误 |

### 当前需要产品/后端共同确认的实现注意点

当前 `downgrade` 接口会把 flow 状态更新为：

```text
downgraded_task_assigned
```

但 `completion-ritual` 接口当前只允许 flow 状态为：

```text
waiting_completion
```

因此如果前端在降级后立即对新任务调用 `completion-ritual`，按当前代码可能会遇到 `invalid flow status`。产品期望更像：

```text
completion_ritual_started
→ redemption_failed
→ downgraded_task_assigned
→ waiting_completion
```

当前代码只走到了 `downgraded_task_assigned`。建议后端后续二选一：

1. `downgrade` 内部继续推进到 `waiting_completion` 后返回；
2. 或让 `completion-ritual` 同时允许 `downgraded_task_assigned`。

本文档以下接口描述以**当前真实实现**为准，同时在降级接口处标注该注意点。

---

## 1. 通用约定

### 1.1 Base URL

```text
本地默认：http://localhost:8787
本地可指定端口：wrangler dev --port 8788
线上环境：https://<worker-domain>
```

### 1.2 通用请求头

除健康检查外，业务接口都需要用户标识：

```http
Content-Type: application/json
X-User-Id: user_123
```

说明：

- MVP 暂不做登录；
- 前端用 `X-User-Id` 标识用户；
- 缺少 `X-User-Id` 时返回 `40101`。

### 1.3 前端状态保存约定

- 前端需要保存当前活跃的 `flow_id`，推荐使用 `localStorage` 或 `sessionStorage`。
- 页面刷新后，前端应优先使用保存的 `flow_id` 调用 `GET /api/v1/confession-flows/{flow_id}` 恢复当前流程。
- 如果本地没有可用的 `flow_id`，前端应回到初始忏悔态，而不是假设存在可恢复的流程。
- 当前协议没有“查询当前活跃流程”的独立接口，首版按单流程恢复处理。

### 1.4 统一成功响应

```json
{
  "code": 0,
  "message": "ok",
  "data": {}
}
```

### 1.5 统一错误响应

```json
{
  "code": 40001,
  "message": "invalid flow status",
  "data": {
    "current_status": "reward_settled"
  }
}
```

---

## 2. 状态枚举

当前后端类型定义中的 flow 状态：

```text
idle
confessed
judged
waiting_completion
completion_ritual_started
self_confirmed
reward_settled
oracle_unlocked
redemption_failed
downgraded_task_assigned
```

### 2.1 主流程状态

概念流程：

```text
idle
→ confessed
→ judged
→ waiting_completion
→ completion_ritual_started
→ self_confirmed
→ reward_settled / oracle_unlocked
```

当前实现里，`POST /api/v1/confession-flows` 会一次性创建忏悔、审判、任务，并直接返回：

```text
waiting_completion
```

也就是说，`confessed`、`judged` 目前更多是状态机预留状态，接口层不会逐步暴露。

### 2.2 未完成降级流程

当前代码的状态机定义：

```text
completion_ritual_started
→ redemption_failed
→ downgraded_task_assigned
```

当前 `downgrade` 接口会创建新 Tiny 任务，新任务 `task.status = waiting_completion`，但 flow 状态返回 `downgraded_task_assigned`。

---

## 3. API 总览

| 页面/动作 | 方法 | 接口 |
|---|---:|---|
| 健康检查 | GET | `/api/v1/health` |
| 心灵导师普通聊天 | POST | `/api/v1/agent/chat` |
| 心灵导师流式聊天 | POST | `/api/v1/agent/chat-stream` |
| 用户提交忏悔 | POST | `/api/v1/confession-flows` |
| 页面刷新恢复 | GET | `/api/v1/confession-flows/{flow_id}` |
| 点击请求神明见证 | POST | `/api/v1/tasks/{task_id}/completion-ritual` |
| 选择未完成，生成 Tiny 任务 | POST | `/api/v1/tasks/{task_id}/downgrade` |
| 选择诚实完成并确认 | POST | `/api/v1/tasks/{task_id}/self-confirm` |
| 展示灵魂结算 / 获取神谕 | POST | `/api/v1/tasks/{task_id}/settle` |
| 查看灵魂档案 | GET | `/api/v1/users/me/profile` |

---

## 4. 健康检查

```http
GET /api/v1/health
```

### 请求

无需请求体。

### 响应

```json
{
  "code": 0,
  "message": "ok",
  "data": {
    "status": "ok",
    "agent_provider": "stepfun",
    "stepfun_model": "step-3.7-flash"
  }
}
```

字段说明：

| 字段 | 说明 |
|---|---|
| `agent_provider` | `stepfun` 表示配置了 `STEPFUN_API_KEY`；`template` 表示未配置 Key，会使用模板兜底 |
| `stepfun_model` | 当前 StepFun 模型，默认 `step-3.7-flash` |

---

## 5. 心灵导师普通聊天

```http
POST /api/v1/agent/chat
```

### 用途

用于自由聊天场景。当前后端会自动注入“赛博上帝的心灵导师形态”人格。

注意：当前聊天人格不是审判流人格。后端注入的系统 prompt 明确要求：

- 温暖、清醒、有洞察；
- 可以有轻微赛博隐喻和幽默；
- 不进入审判、定罪、判决、惩罚或任务派发叙事；
- 不使用“罪名”“判处”“惩罚”“审判成立”“救赎任务”“打卡”等流程话术；
- 不替代心理治疗。

如果前端传了 system message，后端不会直接丢弃，而是作为“前端补充系统上下文”合并进后端人格 prompt。

### 请求

```json
{
  "messages": [
    {
      "role": "user",
      "content": "我最近总是拖延，感觉自己很没用。"
    }
  ]
}
```

也允许传前端补充 system：

```json
{
  "messages": [
    {
      "role": "system",
      "content": "请回复得更短一点。"
    },
    {
      "role": "user",
      "content": "我最近总是拖延，感觉自己很没用。"
    }
  ]
}
```

字段说明：

| 字段 | 类型 | 必填 | 说明 |
|---|---|---:|---|
| `messages` | array | 是 | OpenAI 风格消息数组 |
| `messages[].role` | string | 是 | 只能是 `system`、`user`、`assistant` |
| `messages[].content` | string | 是 | 非空文本 |

### 响应

```json
{
  "code": 0,
  "message": "ok",
  "data": {
    "message": {
      "role": "assistant",
      "content": "我听见的不是“你没用”，而是你已经被拖延消耗到开始怀疑自己了。先别急着审判自己，我们可以先看清：你是在逃避任务本身，还是在逃避任务背后的压力？"
    },
    "agent": {
      "provider": "stepfun",
      "model": "step-3.7-flash",
      "fallback": false
    }
  }
}
```

### 失败情况

- 未配置 `STEPFUN_API_KEY`：返回 `50000 internal error`，message 中会包含 `STEPFUN_API_KEY is not configured`；
- `messages` 为空：返回 `40000 messages is required`；
- role 不合法：返回 `40000 messages[index].role is invalid`。

---

## 6. 心灵导师流式聊天

```http
POST /api/v1/agent/chat-stream
```

### 用途

和普通聊天相同，但以 SSE 形式流式返回 StepFun 结果。

同样会自动注入“赛博上帝的心灵导师形态”人格。

### 请求

请求体同 `/api/v1/agent/chat`：

```json
{
  "messages": [
    {
      "role": "user",
      "content": "我今天状态很差，不知道该怎么办。"
    }
  ]
}
```

### 响应

```http
Content-Type: text/event-stream; charset=utf-8
```

后端会透传 StepFun SSE 流，格式类似：

```text
data: {"choices":[{"delta":{"role":"assistant","content":""}}]}

data: {"choices":[{"delta":{"content":"我"}}]}

data: [DONE]
```

注意：StepFun 可能返回 `reasoning` / `reasoning_content` 字段。前端如果只展示最终回答，应只拼接：

```text
choices[0].delta.content
```

不要把 `reasoning` 展示给用户。

---

## 7. 创建忏悔审判流

```http
POST /api/v1/confession-flows
```

### 用途

用户提交忏悔内容，后端创建一条完整忏悔流，并返回：

- 行为诊断；
- 审判文案；
- 救赎任务；
- 当前状态。

### 当前真实生成逻辑

当前实现不是全部交给 LLM，且审判和任务两路 StepFun 调用已并发：

```text
用户忏悔
→ 关键词诊断 behavior_type
→ 并发调用 StepFun：
   1. 生成审判文案：rap_intro / sin_name / sentence
   2. 生成救赎任务：title / steps / duration_minutes / psychology
→ 本地模板库决定 reward 奖励数值
→ 保存 DB
→ 返回 waiting_completion
```

也就是说：

- StepFun 负责“怎么骂得好玩”；
- StepFun 也负责“任务怎么设计得更贴合用户忏悔”；
- 任务生成不再依赖 judgement 结果，只依赖 `content + diagnosis`，因此可以和审判并发；
- 本地模板仍负责奖励数值，避免模型影响结算和升级。

### 请求

```json
{
  "content": "神啊，我今天刷了 3 小时短视频。",
  "roast_level": 3
}
```

字段说明：

| 字段 | 类型 | 必填 | 说明 |
|---|---|---:|---|
| `content` | string | 是 | 用户忏悔内容 |
| `roast_level` | number | 否 | 毒舌强度，1-5，默认 3；小数会向下取整；超出范围会被 clamp 到 1-5 |

### 行为诊断关键词

当前实现是简单关键词匹配：

| 命中关键词 | `behavior_type` | `severity` | `main_barrier` |
|---|---|---|---|
| 短视频、抖音、视频、刷了 | `short_video_overuse` | `medium` | `opportunity` |
| 拖延、没做、明天、计划 | `procrastination` | `medium` | `motivation` |
| 健身、运动、深蹲、跑步 | `fitness_missing` | `medium` | `motivation` |
| 学习、读书、资料、考试 | `study_avoidance` | `medium` | `capability` |
| 朋友、社交、消息、回复 | `social_avoidance` | `low` | `motivation` |
| 其他 | `generic` | `low` | `motivation` |

### 响应

```json
{
  "code": 0,
  "message": "ok",
  "data": {
    "flow_id": "flow_001",
    "status": "waiting_completion",
    "diagnosis": {
      "behavior_type": "short_video_overuse",
      "severity": "medium",
      "main_barrier": "opportunity"
    },
    "judgement": {
      "judgement_id": "judgement_001",
      "rap_intro": "你说要逆天改命，结果给算法卖命。",
      "sin_name": "数字功德诈骗罪",
      "sentence": "暂停做梦资格 24 小时。",
      "roast_level": 3
    },
    "task": {
      "task_id": "task_001",
      "title": "算法断供仪式",
      "steps": [
        "把短视频 App 移出手机首页",
        "设置 15 分钟计时器",
        "计时结束前不打开短视频 App"
      ],
      "duration_minutes": 15,
      "reward": {
        "wisdom": 1,
        "discipline": 2,
        "courage": 0,
        "compassion": 0,
        "exp": 10
      },
      "status": "waiting_completion"
    },
    "agent": {
      "provider": "stepfun",
      "model": "step-3.7-flash",
      "fallback": false
    }
  }
}
```

### StepFun / 模板兜底说明

- 如果没有配置 `STEPFUN_API_KEY`，审判文案和任务都来自本地模板；
- 如果配置了 `STEPFUN_API_KEY`，审判文案和任务文案都来自 StepFun；
- 当前代码里，配置了 Key 但 StepFun 调用失败时，会返回错误，不会自动降级成模板；
- 任务的 `reward` 始终来自模板库。

### 前端使用说明

- `status` 用于驱动页面主状态切换。
- `diagnosis` 用于展示问题识别结果。
- `judgement` 用于展示审判文案。
- `task` 用于展示首个弥补任务卡片。
- 该接口不返回历史时间线，不承担档案页职责。

---

## 8. 查询忏悔流详情

```http
GET /api/v1/confession-flows/{flow_id}
```

### 用途

页面刷新、重新进入详情页时，恢复当前 flow、confession、judgement 和当前 task。

### 请求

无需请求体。

### 响应

```json
{
  "code": 0,
  "message": "ok",
  "data": {
    "flow_id": "flow_001",
    "status": "waiting_completion",
    "confession": {
      "content": "神啊，我今天刷了 3 小时短视频。",
      "behavior_type": "short_video_overuse"
    },
    "judgement": {
      "rap_intro": "你说要逆天改命，结果给算法卖命。",
      "sin_name": "数字功德诈骗罪",
      "sentence": "暂停做梦资格 24 小时。"
    },
    "task": {
      "task_id": "task_001",
      "title": "算法断供仪式",
      "steps": [
        "把短视频 App 移出手机首页",
        "设置 15 分钟计时器",
        "计时结束前不打开短视频 App"
      ],
      "duration_minutes": 15,
      "reward": {
        "wisdom": 1,
        "discipline": 2,
        "courage": 0,
        "compassion": 0,
        "exp": 10
      },
      "status": "waiting_completion"
    }
  }
}
```

注意：

- `judgement` 里不返回 `judgement_id` 和 `roast_level`；
- `task` 始终返回当前 flow 绑定的任务，降级后会返回新 Tiny 任务。

### 前端使用说明

- 该接口是页面刷新恢复的核心入口。
- `status` 直接映射页面状态机。
- `confession`、`judgement`、`task` 三块内容可直接重建当前聊天流。
- 该接口不提供最近历史列表，只恢复当前流程。

---

## 9. 开启完成仪式

```http
POST /api/v1/tasks/{task_id}/completion-ritual
```

### 用途

用户点击“请求神明见证”，进入完成确认仪式。

### 前置状态

当前代码要求：

```text
flow.status == waiting_completion
```

且 URL 里的 `task_id` 必须等于当前 flow 绑定的 `task_id`。

### 请求

```json
{
  "flow_id": "flow_001"
}
```

### 响应

```json
{
  "code": 0,
  "message": "ok",
  "data": {
    "flow_id": "flow_001",
    "task_id": "task_001",
    "status": "completion_ritual_started",
    "ritual": {
      "title": "赛博上帝正在凝视你",
      "content": "你不需要向我证明。但你心里知道，这一次，你有没有真的完成救赎。",
      "options": [
        {
          "value": "completed",
          "label": "我诚实完成了"
        },
        {
          "value": "not_completed",
          "label": "我没有完成，请给我一个更小的救赎任务"
        }
      ]
    }
  }
}
```

### 前端使用说明

- `ritual.options` 直接映射为两个操作按钮。
- `completion_ritual_started` 是一个独立页面态或对话态。
- 用户选择 `completed` 或 `not_completed` 后，前端分别继续走 `self-confirm` 或 `downgrade`。

---

## 10. 未完成，生成 Tiny 任务

```http
POST /api/v1/tasks/{task_id}/downgrade
```

### 用途

用户选择“我没有完成”，后端把原任务标记为失败，并生成一个更小的 Tiny 任务。

### 前置状态

当前代码要求：

```text
flow.status == completion_ritual_started
```

### 请求

```json
{
  "flow_id": "flow_001"
}
```

说明：

- 当前代码只读取 `flow_id`；
- 如果前端传 `reason`，后端会忽略。

### 响应

```json
{
  "code": 0,
  "message": "ok",
  "data": {
    "flow_id": "flow_001",
    "previous_task_id": "task_001",
    "status": "downgraded_task_assigned",
    "message": "诚实，比伪装完成更接近救赎。",
    "task": {
      "task_id": "task_002",
      "title": "三分钟断供",
      "steps": [
        "把手机扣在桌上",
        "设置 3 分钟计时器",
        "计时结束前不要碰手机"
      ],
      "duration_minutes": 3,
      "reward": {
        "wisdom": 0,
        "discipline": 1,
        "courage": 0,
        "compassion": 0,
        "exp": 3
      },
      "status": "waiting_completion"
    }
  }
}
```

### 产品 / 前端注意

当前响应里有两个 status：

| 字段 | 含义 |
|---|---|
| `data.status` | flow 状态，当前实现为 `downgraded_task_assigned` |
| `data.task.status` | 新任务状态，当前实现为 `waiting_completion` |

按产品语义，新 Tiny 任务应该可以继续进入完成仪式。但当前 `completion-ritual` 只接受 flow 状态 `waiting_completion`，所以这里需要后端后续修正状态推进逻辑。

### 前端使用说明

- `previous_task_id` 用于提示用户当前任务已降级。
- `message` 用于展示系统的态度反馈。
- `task` 直接替换当前任务卡片，不需要离开当前流程。

---

## 11. 自我确认完成

```http
POST /api/v1/tasks/{task_id}/self-confirm
```

### 用途

用户选择“我诚实完成了”，提交可选见证材料和必填自我确认文本。

### 前置状态

当前代码要求：

```text
flow.status == completion_ritual_started
```

### 请求

```json
{
  "flow_id": "flow_001",
  "witness": {
    "witness_type": "text",
    "content": "我把 App 移出了首页，并撑过了 15 分钟。"
  },
  "self_confirmation_text": "我确认：这次救赎，我没有糊弄自己。"
}
```

字段说明：

| 字段 | 类型 | 必填 | 说明 |
|---|---|---:|---|
| `flow_id` | string | 是 | 当前 flow ID |
| `witness` | object | 否 | 见证信息 |
| `witness.witness_type` | string | 否 | 默认 `text` |
| `witness.content` | string | 否 | 文本见证内容 |
| `self_confirmation_text` | string | 是 | 自我确认文案 |

### 响应

```json
{
  "code": 0,
  "message": "ok",
  "data": {
    "flow_id": "flow_001",
    "task_id": "task_001",
    "status": "self_confirmed",
    "witness_id": "witness_001"
  }
}
```

说明：

- 见证材料只保存，不审核真假；
- 当前没有图片 / 文件上传逻辑，`file_key` 固定写入 `null`；
- 如果不传 `witness`，后端会用 `witness_type = text`、`content = null`。

### 前端使用说明

- `self_confirmation_text` 是首版必须填写的确认文案。
- `witness` 首版只需要做成可选文本补充区。
- 返回 `self_confirmed` 后，前端继续调用 `settle` 进入结算阶段。

---

## 12. 结算奖励 / 获取神谕

```http
POST /api/v1/tasks/{task_id}/settle
```

### 用途

完成任务后结算：

- 属性奖励；
- EXP；
- 等级变化；
- 神谕；
- 完成结算文案 `god_reply`。

### 前置状态

当前代码要求：

```text
flow.status == self_confirmed
```

如果该任务已经结算过，会直接返回幂等结果。

### 请求

```json
{
  "flow_id": "flow_001"
}
```

### 响应：未升级

```json
{
  "code": 0,
  "message": "ok",
  "data": {
    "flow_id": "flow_001",
    "task_id": "task_001",
    "status": "reward_settled",
    "settlement": {
      "reward_event_id": "reward_001",
      "reward": {
        "wisdom": 1,
        "discipline": 2,
        "courage": 0,
        "compassion": 0,
        "exp": 10
      },
      "before": {
        "level": 1,
        "exp": 0
      },
      "after": {
        "level": 1,
        "exp": 10
      },
      "level_up": false
    },
    "oracle": {
      "unlocked": false,
      "text": null
    },
    "god_reply": "救赎已被见证。今天你没有继续向算法进贡，也没有把承诺扔进明天的垃圾桶。",
    "agent": {
      "provider": "stepfun",
      "model": "step-3.7-flash",
      "fallback": false
    }
  }
}
```

### 响应：升级并解锁神谕

```json
{
  "code": 0,
  "message": "ok",
  "data": {
    "flow_id": "flow_001",
    "task_id": "task_001",
    "status": "oracle_unlocked",
    "settlement": {
      "reward_event_id": "reward_001",
      "reward": {
        "wisdom": 1,
        "discipline": 2,
        "courage": 0,
        "compassion": 0,
        "exp": 10
      },
      "before": {
        "level": 1,
        "exp": 20
      },
      "after": {
        "level": 2,
        "exp": 0
      },
      "level_up": true
    },
    "oracle": {
      "unlocked": true,
      "text": "你不是没有时间。你只是把时间送给了别人设计的人生。"
    },
    "god_reply": "救赎已被见证。今天你没有继续向算法进贡，也没有把承诺扔进明天的垃圾桶。",
    "agent": {
      "provider": "stepfun",
      "model": "step-3.7-flash",
      "fallback": false
    }
  }
}
```

### 神谕规则

神谕只通过本接口返回：

```text
POST /api/v1/tasks/{task_id}/settle
```

当前规则：

- 每 30 EXP 升 1 级；
- 只有升级时才解锁神谕；
- 未升级时：`oracle.unlocked = false`、`oracle.text = null`；
- 升级时：`oracle.unlocked = true`、`oracle.text` 为 StepFun 或模板生成的神谕。

### 前端使用说明

- `settlement.before` 和 `settlement.after` 用于展示等级和经验变化。
- `oracle.unlocked` 为 `true` 时可以展示额外神谕卡片。
- `god_reply` 适合放在结算后的剧情气泡里。
- 该接口是任务闭环的最终展示点。

### 重复结算响应

```json
{
  "code": 0,
  "message": "already settled",
  "data": {
    "flow_id": "flow_001",
    "task_id": "task_001",
    "status": "reward_settled",
    "reward_event_id": "reward_001",
    "idempotent": true
  }
}
```

注意：幂等返回里的 `status` 是当前 flow 状态，可能是 `reward_settled` 或 `oracle_unlocked`。

---

## 13. 查询用户灵魂档案

```http
GET /api/v1/users/me/profile
```

### 用途

查看当前用户等级、经验、属性和任务统计。

如果用户档案不存在，后端会自动创建初始档案：

```text
nickname = 凡人
level = 1
exp = 0
wisdom = 0
discipline = 0
courage = 0
compassion = 0
```

### 请求

无需请求体。

### 响应

```json
{
  "code": 0,
  "message": "ok",
  "data": {
    "user_id": "user_123",
    "nickname": "凡人",
    "level": 2,
    "exp": 0,
    "next_level_exp": 30,
    "attributes": {
      "wisdom": 3,
      "discipline": 6,
      "courage": 0,
      "compassion": 0
    },
    "stats": {
      "completed_tasks": 3,
      "failed_tasks": 1
    }
  }
}
```

统计说明：

| 字段 | 统计来源 |
|---|---|
| `completed_tasks` | `redemption_tasks.status = completed` 的数量 |
| `failed_tasks` | `redemption_tasks.status = redemption_failed` 的数量 |

### 前端使用说明

- `attributes` 用于成长面板的四维属性展示。
- `stats` 只提供完成数与失败数汇总。
- 当前协议没有历史任务列表、时间线或最近 N 次忏悔记录接口，因此前端的“行为记录区”应按摘要卡设计，而不是完整档案列表。
- 如果后续要做完整历史页，需要新增独立接口。

---

## 14. 推荐前端调用顺序

### 14.1 完成主流程

```text
1. POST /api/v1/confession-flows
   得到 flow_id、task_id

2. POST /api/v1/tasks/{task_id}/completion-ritual
   进入完成确认仪式

3. POST /api/v1/tasks/{task_id}/self-confirm
   用户确认完成

4. POST /api/v1/tasks/{task_id}/settle
   结算奖励，可能解锁神谕

5. GET /api/v1/users/me/profile
   刷新用户档案
```

### 14.2 未完成降级流程

按产品期望：

```text
1. POST /api/v1/tasks/{task_id}/completion-ritual

2. POST /api/v1/tasks/{task_id}/downgrade
   得到 new_task_id

3. 对 new_task_id 重新进入完成流程
```

但当前后端存在状态推进注意点：`downgrade` 后 flow 状态为 `downgraded_task_assigned`，而 `completion-ritual` 当前只接受 `waiting_completion`。前端接入时需要先和后端确认该状态推进修复。

---

## 15. 常见错误码

| code | HTTP | message 示例 | 说明 |
|---:|---:|---|---|
| 0 | 200 | `ok` | 成功 |
| 40000 | 400 | `invalid json` | 请求体不是合法 JSON |
| 40000 | 400 | `content is required` | 创建忏悔流缺少内容 |
| 40000 | 400 | `flow_id is required` | 需要 flow ID 的接口未传 |
| 40000 | 400 | `self_confirmation_text is required` | 自我确认文案未传 |
| 40000 | 400 | `messages is required` | 聊天接口消息为空 |
| 40000 | 400 | `messages[index].role is invalid` | 聊天消息 role 非法 |
| 40000 | 400 | `task does not belong to flow` | URL 里的 task_id 不属于该 flow |
| 40001 | 400 | `invalid flow status` | 当前 flow 状态不允许该操作 |
| 40101 | 401 | `missing user id` | 缺少 `X-User-Id` |
| 40400 | 404 | `not found` | 路由不存在 |
| 40401 | 404 | `flow not found` / `profile not found` | 流程或用户档案不存在 |
| 40402 | 404 | `task not found` | 任务不存在 |
| 50000 | 500 | `internal error` | 服务内部错误，可能包含 StepFun 调用失败 |

---

## 16. 本地开发配置

后端读取以下环境变量：

```text
STEPFUN_API_KEY=sk-your-stepfun-api-key
STEPFUN_MODEL=step-3.7-flash
STEPFUN_BASE_URL=https://api.stepfun.com/v1
STEPFUN_REASONING_EFFORT=low
```

说明：

- `STEPFUN_API_KEY` 不配置时，忏悔审判流会使用本地模板；
- 普通聊天和流式聊天必须配置 `STEPFUN_API_KEY`；
- 当前代码默认 `STEPFUN_BASE_URL=https://api.stepfun.com/v1`。
