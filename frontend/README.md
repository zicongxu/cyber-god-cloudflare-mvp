# Frontend

GodChat 首版前端原型，采用原生 HTML/CSS/JavaScript 的轻量模块化结构。

## 目录结构

- `frontend/index.html`
- `frontend/src/app.js`
- `frontend/src/state.js`
- `frontend/src/api.js`
- `frontend/src/render.js`
- `frontend/src/styles.css`

## 运行方式

默认后端地址为 `http://localhost:8787`。

本地可以直接起静态服务器：

```bash
python3 -m http.server 4173 -d frontend
```

然后访问 `http://localhost:4173`。

## 协议

前后端交互协议见 [docs/api-protocol.md](/Users/jianming.luo/Documents/person-project/godchat/docs/api-protocol.md)。
