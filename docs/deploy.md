# 部署说明

## Cloudflare

已创建 D1 数据库：

```text
database_name: cyber_god_mvp
database_id: d6859b51-3cbe-46fa-b5b5-d8ec36647098
```

已发布 Worker：

```text
https://cyber-god-api.hi542994938.workers.dev
```

当前部署版本：

```text
f087c9ce-3b04-4fe1-8026-d3d051c382b9
```

## 本地开发

```bash
cd backend
npm install
cp .dev.vars.example .dev.vars
# 编辑 .dev.vars，填入 STEPFUN_API_KEY
npm run db:migrate:local
npm run dev
```

本地 API：

```text
http://localhost:8787
```

## 远端发布

首次配置 StepFun API Key：

```bash
cd backend
npx wrangler secret put STEPFUN_API_KEY
```

发布：

```bash
cd backend
npm run typecheck
npm run db:migrate:remote
npm run deploy
```

当前 StepFun 接入使用 Step Plan reasoning API：

```text
STEPFUN_BASE_URL=https://api.stepfun.com/step_plan/v1
STEPFUN_MODEL=step-3.7-flash
STEPFUN_REASONING_EFFORT=low
```

## 验证请求

```bash
curl -X POST https://cyber-god-api.hi542994938.workers.dev/api/v1/confession-flows \
  -H 'content-type: application/json' \
  -H 'x-user-id: demo_user' \
  -d '{"content":"神啊，我今天刷了 3 小时短视频。","roast_level":3}'
```

注意：当前开发机访问 `workers.dev` 时可能在 TLS 握手阶段被网络重置。Cloudflare 部署记录已确认发布成功，本地 Worker 闭环也已验证通过。
