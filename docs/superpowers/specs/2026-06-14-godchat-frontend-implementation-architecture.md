# GodChat 前端实现架构设计

## 1. 目标

本设计稿用于把已确认的 TRD 落到真实前端实现结构中。目标是实现一个 `Web 承载 + 移动端 App 风格` 的可运行原型页，页面内完成以下闭环：

1. 用户提交忏悔。
2. 前端展示上帝审判与任务派发。
3. 用户进入完成仪式，选择诚实完成或未完成。
4. 未完成时降级为更小任务。
5. 完成后进入确认与结算。
6. 页面刷新后可恢复当前流程。

本设计只覆盖前端实现，不讨论后端存储、数据库迁移或业务扩展。

## 2. 约束

### 2.1 已确认前提

- 产品形态是 Web。
- 产品展示风格是移动端 App 风格。
- 首版是单页，不做多页面路由。
- 页面核心交互是聊天。
- 后端协议已经确定，见 [docs/api-protocol.md](/Users/jianming.luo/Documents/person-project/godchat/docs/api-protocol.md)。
- 页面结构和文案边界已经确定，见 [frontend/2026-06-14-godchat-web-chat-design.md](/Users/jianming.luo/Documents/person-project/godchat/frontend/2026-06-14-godchat-web-chat-design.md)。

### 2.2 实现原则

- 入口页尽量轻，避免一开始就引入完整工程复杂度。
- 逻辑必须分层，不能把接口、状态、渲染和样式写在同一个文件里。
- 前端必须能处理刷新恢复，不依赖页面重进后用户重新输入。
- UI 需要保持单列、窄屏、底部输入栏固定的移动端感。
- 页面实现阶段通过 `product-design:index` 作为 Product Design 插件路由入口，再进入具体的原型实现工作流。

## 3. 推荐方案

我建议采用 `轻量模块化`：

- 一个入口页负责挂载。
- 一个状态层负责当前流程和持久化。
- 一个接口层负责协议调用。
- 一个渲染层负责把状态变成聊天流和卡片。
- 一个样式文件负责 App 风格外观。

这个方案比单文件原型更接近真实前端结构，也比完整工程化拆分更适合当前 MVP。

## 4. 模块拆分

### 4.1 `index.html`

职责：

- 提供页面根容器。
- 引入样式和脚本。
- 不承载业务逻辑。

依赖：

- `src/styles.css`
- `src/app.js`

### 4.2 `src/app.js`

职责：

- 启动应用。
- 加载本地保存的 `flow_id`。
- 协调状态层、接口层和渲染层。
- 绑定底部输入栏和卡片按钮事件。

依赖：

- `state.js`
- `api.js`
- `render.js`

### 4.3 `src/state.js`

职责：

- 保存当前会话状态。
- 维护 `flow_id`、`task_id`、`status`、消息列表、加载状态、错误状态。
- 负责本地持久化。

建议状态字段：

- `flowId`
- `taskId`
- `status`
- `messages`
- `profile`
- `loading`
- `error`

### 4.4 `src/api.js`

职责：

- 封装所有后端接口。
- 自动携带 `X-User-Id`。
- 统一处理 JSON 响应和错误码。
- 提供和协议一一对应的函数。

建议接口函数：

- `createConfessionFlow`
- `getConfessionFlow`
- `startCompletionRitual`
- `downgradeTask`
- `selfConfirmTask`
- `settleTask`
- `getProfile`

### 4.5 `src/render.js`

职责：

- 根据状态生成页面结构。
- 渲染顶部状态条、聊天流、任务卡、完成仪式卡、结算卡、档案摘要。
- 渲染底部输入栏和交互按钮。

要求：

- 尽量保持纯渲染。
- 不在渲染层直接发请求。
- 不在渲染层直接操作本地存储。

### 4.6 `src/styles.css`

职责：

- 实现 App 风格布局。
- 定义深色主题、竖屏窄宽度、消息气泡、卡片样式、底部固定输入栏。
- 处理移动端安全区和响应式布局。

## 5. 数据流

### 5.1 会话数据

会话数据只围绕一个活跃流程展开。核心字段如下：

- `flowId`
- `taskId`
- `status`
- `confession`
- `judgement`
- `task`
- `ritual`
- `settlement`

数据来源：

- 首次提交忏悔后由 `POST /api/v1/confession-flows` 创建。
- 页面刷新时由 `GET /api/v1/confession-flows/{flow_id}` 恢复。

### 5.2 UI 状态

UI 状态只服务渲染，不参与业务判断：

- 输入框当前内容
- 按钮 loading
- 错误提示
- 折叠区展开状态
- 结算展示是否展开

### 5.3 单向流转

推荐的数据流顺序：

1. 用户在底部输入栏提交忏悔。
2. `app.js` 调用 `api.js`。
3. 响应写入 `state.js`。
4. `render.js` 根据新状态更新聊天流。
5. 用户继续点完成仪式、确认、结算。
6. 每次状态变化后，`state.js` 持久化当前 `flow_id` 和关键数据。

## 6. 状态机映射

前端状态应和后端协议状态一致，并额外支持一个 `restoring` 状态。

### 6.1 前端状态

- `restoring`
- `idle`
- `confessed`
- `judged`
- `waiting_completion`
- `completion_ritual_started`
- `redemption_failed`
- `downgraded_task_assigned`
- `self_confirmed`
- `reward_settled`
- `oracle_unlocked`

### 6.2 状态说明

- `restoring`：页面启动后尝试恢复本地流程。
- `idle`：等待用户首次忏悔。
- `confessed`：忏悔已提交，审判信息可渲染。
- `judged`：审判内容已可见。
- `waiting_completion`：展示主任务卡。
- `completion_ritual_started`：展示完成仪式卡。
- `redemption_failed`：展示“未完成”后的降级反馈。
- `downgraded_task_assigned`：展示降级任务卡。
- `self_confirmed`：展示自我确认结果。
- `reward_settled`：展示结算结果。
- `oracle_unlocked`：展示神谕卡和额外剧情。

## 7. 消息与卡片模型

### 7.1 消息类型

- `user-confession`
- `god-judgement`
- `task-card`
- `ritual-card`
- `settlement-card`
- `profile-snippet`
- `system-note`

### 7.2 组件边界

- 气泡用于对话内容。
- 卡片用于任务、完成仪式、结算和档案摘要。
- 底部输入栏用于提交忏悔和触发动作。

### 7.3 渲染规则

- 同一流程的消息按时间顺序追加。
- 关键状态只显示对应卡片，不在同一时刻同时堆叠过多卡片。
- 结算完成后才展示 `reward_settled` 和 `oracle_unlocked` 的最终反馈。

## 8. 接口边界

### 8.1 请求约定

- 所有请求带 `X-User-Id`。
- 请求体统一 JSON。
- 失败时由 `api.js` 统一转成可展示错误。

### 8.2 接口职责

- `POST /api/v1/confession-flows`：创建流程。
- `GET /api/v1/confession-flows/{flow_id}`：恢复当前流程。
- `POST /api/v1/tasks/{task_id}/completion-ritual`：进入完成仪式。
- `POST /api/v1/tasks/{task_id}/downgrade`：降级任务。
- `POST /api/v1/tasks/{task_id}/self-confirm`：自我确认。
- `POST /api/v1/tasks/{task_id}/settle`：结算奖励。
- `GET /api/v1/users/me/profile`：获取档案摘要。

### 8.3 前端已知缺口

当前协议足够支撑首版原型，但有两个实现约束需要在前端处理：

- 没有“查询当前活跃流程”接口，因此前端必须自己保存 `flow_id`。
- 没有历史时间线接口，因此行为记录区只能做摘要，不做完整流水。

## 9. 错误处理

### 9.1 网络错误

- 接口超时或断网时，页面显示轻量错误提示。
- 用户可以重试当前动作。
- 已存在的会话状态不应被错误清空。

### 9.2 业务错误

- `40000`：输入缺失或格式不对，提示用户补充忏悔内容。
- `40001`：状态不允许，提示当前流程已经进入别的阶段。
- `40101`：缺少用户标识，提示配置 `X-User-Id`。
- `40401/40402`：流程或任务不存在，回到初始态并清理本地无效缓存。
- `50000`：服务内部错误，保留当前状态并允许重试。

### 9.3 恢复失败

- 如果本地 `flow_id` 无效，直接回到 `idle`。
- 如果恢复接口返回不存在，清理本地会话并重新开始。

## 10. 验收标准

实现完成后，至少应满足：

1. 页面是 Web 承载，但观感接近移动端 App。
2. 用户能在单页完成忏悔、审判、任务、完成仪式、确认、结算。
3. 页面刷新后可以恢复当前流程。
4. 未完成分支可以降级任务并继续闭环。
5. 用户档案摘要能在页面中展示。
6. 代码结构已拆成入口、状态、接口、渲染和样式几层。
7. 核心逻辑不堆在单个文件里。

## 11. 交付顺序

建议按以下顺序落地：

1. 建好 `index.html` 和 `styles.css`，先做出 App 外壳。
2. 实现 `state.js`，先把 `flow_id` 恢复和状态持久化打通。
3. 实现 `api.js`，让首版流程接口全部可调用。
4. 实现 `render.js`，把消息流和卡片渲染出来。
5. 在 `app.js` 中把所有模块串起来，完成首版原型页。
6. 如果进入后续页面实现流程，先通过 `product-design:index` 路由到 Product Design 插件下的具体实现工作流，再继续落地。
