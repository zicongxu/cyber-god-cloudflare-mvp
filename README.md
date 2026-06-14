# Cyber God Cloudflare MVP

赛博上帝 MVP 仓库，采用前后端分离结构。

## 目录

```text
frontend/      前端工程占位，交给前端同学实现
backend/       Cloudflare Workers 后端
docs/          前后端交互协议与开发约定
```

## MVP 闭环

```text
用户忏悔
→ 行为诊断
→ 生成审判
→ 派发救赎任务
→ 开启见证仪式
→ 用户确认完成 / 未完成
→ 奖励结算
→ 可选神谕
```

## 后端技术栈

```text
Cloudflare Workers
Cloudflare D1
TypeScript
```

协议文档见 [docs/api-protocol.md](docs/api-protocol.md)。

部署说明见 [docs/deploy.md](docs/deploy.md)。

## CLI 入口

后端目录内已提供赛博上帝终端入口：

```bash
cd backend
npm run dev
# 另开终端
npm run god:enter
```

也可以使用命令式闭环：

```bash
npm run god -- confess "神啊，我今天刷了三小时短视频"
npm run god -- ritual
npm run god -- confirm "神明，我诚实完成了，这次没有糊弄自己。"
npm run god -- settle
npm run god -- profile
```

更多命令见：

```bash
npm run god -- help
```

