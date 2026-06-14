# Backend

Cloudflare Workers 后端，使用 D1 保存业务事实。

## 本地开发

```bash
npm install
cp .dev.vars.example .dev.vars
npm run dev
```

`.dev.vars` 中配置：

```text
STEPFUN_API_KEY=sk-your-stepfun-api-key
STEPFUN_MODEL=step-3.7-flash
STEPFUN_BASE_URL=https://api.stepfun.com/step_plan/v1
STEPFUN_REASONING_EFFORT=low
```

如果未配置 `STEPFUN_API_KEY`，后端会自动使用模板兜底。

## D1 初始化

```bash
npm run db:migrate:local
```

线上执行：

```bash
npm run db:migrate:remote
```

## API 协议

见：

```text
../docs/api-protocol.md
```

## 赛博上帝 CLI 入口

后端现在内置一个无额外依赖的终端入口，直接复用当前 HTTP API。

```bash
# 先启动 Worker
npm run dev

# 另开终端：查看入口协议
npm run god -- help

# 打开交互式忏悔入口
npm run god:enter

# 或走命令式闭环
npm run god -- confess "神啊，我今天又拖延了"
npm run god -- ritual
npm run god -- confirm "神明，我诚实完成了，这次没有糊弄自己。"
npm run god -- settle
npm run god -- profile
```

常用配置：

```bash
npm run god -- config --url http://localhost:8787 --user mortal_cli
CYBER_GOD_URL=http://localhost:8787 CYBER_GOD_USER_ID=mortal_cli npm run god -- profile
```

可用命令包括：`enter`、`confess`、`ritual`、`confirm`、`settle`、`redeem`、`downgrade`、`flow`、`profile`、`health`、`chat`、`config`。
CLI 会把最近一次 `flow_id` / `task_id` 保存到 `~/.cyber-god-cli-state.json`，所以后续命令无需重复传 ID。
