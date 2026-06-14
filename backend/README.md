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
