# 赛博上帝 MVP 前后端交互协议

## 1. 通用约定

Base URL：

```text
本地开发：http://localhost:8787
线上环境：https://<worker-domain>
```

统一请求头：

```http
Content-Type: application/json
X-User-Id: user_123
```

MVP 暂不做登录，前端用 `X-User-Id` 标识用户。没有该 Header 时，后端返回 `40101`。

### 1.1 前端状态保存约定

- 前端需要保存当前活跃的 `flow_id`，推荐使用 `localStorage` 或 `sessionStorage`。
- 页面刷新后，前端应优先使用保存的 `flow_id` 调用 `GET /api/v1/confession-flows/{flow_id}` 恢复当前流程。
- 如果本地没有可用的 `flow_id`，前端应回到初始忏悔态，而不是假设存在可恢复的流程。
- 当前协议没有“查询当前活跃流程”的独立接口，首版按单流程恢复处理。

统一成功响应：

```json
{
  "code": 0,
  "message": "ok",
  "data": {}
}
```

统一错误响应：

```json
{
  "code": 40001,
  "message": "invalid flow status",
  "data": {
    "current_status": "reward_settled"
  }
}
```

## 2. 状态枚举

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

主流程：

```text
idle
→ confessed
→ judged
→ waiting_completion
→ completion_ritual_started
→ self_confirmed
→ reward_settled
→ oracle_unlocked
```

未完成分支：

```text
completion_ritual_started
→ redemption_failed
→ downgraded_task_assigned
→ waiting_completion
```

## 3. API 列表

| 页面/动作 | 接口 |
|---|---|
| 用户提交忏悔 | `POST /api/v1/confession-flows` |
| 页面刷新恢复当前流程 | `GET /api/v1/confession-flows/{flow_id}` |
| 点击请求神明见证 | `POST /api/v1/tasks/{task_id}/completion-ritual` |
| 选择未完成 | `POST /api/v1/tasks/{task_id}/downgrade` |
| 选择诚实完成并确认 | `POST /api/v1/tasks/{task_id}/self-confirm` |
| 展示灵魂结算 | `POST /api/v1/tasks/{task_id}/settle` |
| 查看灵魂档案 | `GET /api/v1/users/me/profile` |

## 4. 创建忏悔审判流

```http
POST /api/v1/confession-flows
```

请求：

```json
{
  "content": "神啊，我今天刷了 3 小时短视频。",
  "roast_level": 3
}
```

字段说明：

| 字段 | 类型 | 必填 | 说明 |
|---|---|---:|---|
| content | string | 是 | 用户忏悔内容 |
| roast_level | number | 否 | 毒舌强度，1-5，默认 3 |

响应：

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
    }
  }
}
```

前端使用说明：

- `status` 用于驱动页面主状态切换。
- `diagnosis` 用于展示问题识别结果。
- `judgement` 用于展示审判文案。
- `task` 用于展示首个弥补任务卡片。
- 该接口不返回历史时间线，不承担档案页职责。

## 5. 查询流程详情

```http
GET /api/v1/confession-flows/{flow_id}
```

响应：

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

前端使用说明：

- 该接口是页面刷新恢复的核心入口。
- `status` 直接映射页面状态机。
- `confession`、`judgement`、`task` 三块内容可直接重建当前聊天流。
- 该接口不提供最近历史列表，只恢复当前流程。

## 6. 开启完成仪式

```http
POST /api/v1/tasks/{task_id}/completion-ritual
```

请求：

```json
{
  "flow_id": "flow_001"
}
```

响应：

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

前端使用说明：

- `ritual.options` 直接映射为两个操作按钮。
- `completion_ritual_started` 是一个独立页面态或对话态。
- 用户选择 `completed` 或 `not_completed` 后，前端分别继续走 `self-confirm` 或 `downgrade`。

## 7. 未完成，生成 Tiny 任务

```http
POST /api/v1/tasks/{task_id}/downgrade
```

请求：

```json
{
  "flow_id": "flow_001",
  "reason": "not_completed"
}
```

响应：

```json
{
  "code": 0,
  "message": "ok",
  "data": {
    "flow_id": "flow_001",
    "previous_task_id": "task_001",
    "status": "waiting_completion",
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

前端使用说明：

- `previous_task_id` 用于提示用户当前任务已降级。
- `message` 用于展示系统的态度反馈。
- `task` 直接替换当前任务卡片，不需要离开当前流程。

## 8. 自我确认完成

```http
POST /api/v1/tasks/{task_id}/self-confirm
```

请求：

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

响应：

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

- `witness` 可为空；
- MVP 只支持 `witness_type=text`；
- `self_confirmation_text` 必填；
- 见证材料只保存，不审核真假。

前端使用说明：

- `self_confirmation_text` 是首版必须填写的确认文案。
- `witness` 首版只需要做成可选文本补充区。
- 返回 `self_confirmed` 后，前端继续调用 `settle` 进入结算阶段。

## 9. 结算奖励

```http
POST /api/v1/tasks/{task_id}/settle
```

请求：

```json
{
  "flow_id": "flow_001"
}
```

响应：

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
    "god_reply": "救赎已被见证。今天你没有继续向算法进贡，也没有把承诺扔进明天的垃圾桶。"
  }
}
```

前端使用说明：

- `settlement.before` 和 `settlement.after` 用于展示等级和经验变化。
- `oracle.unlocked` 为 `true` 时可以展示额外神谕卡片。
- `god_reply` 适合放在结算后的剧情气泡里。
- 该接口是任务闭环的最终展示点。

重复调用响应：

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

## 10. 查询用户灵魂档案

```http
GET /api/v1/users/me/profile
```

响应：

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

前端使用说明：

- `attributes` 用于成长面板的四维属性展示。
- `stats` 只提供完成数与失败数汇总。
- 当前协议没有历史任务列表、时间线或最近 N 次忏悔记录接口，因此前端的“行为记录区”应按摘要卡设计，而不是完整档案列表。
- 如果后续要做完整历史页，需要新增独立接口。

## 11. 错误码

| code | message | 说明 |
|---:|---|---|
| 0 | ok | 成功 |
| 40000 | bad request | 请求体错误或参数缺失 |
| 40001 | invalid flow status | 当前流程状态不允许该操作 |
| 40101 | missing user id | 缺少 `X-User-Id` |
| 40401 | flow not found | 流程不存在 |
| 40402 | task not found | 任务不存在 |
| 50000 | internal error | 服务内部错误 |
