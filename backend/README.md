# Backend

Cloudflare Workers 后端，使用 D1 保存业务事实。

## 本地开发

```bash
npm install
npm run dev
```

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
