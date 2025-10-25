# AI 小说写作（Web）

一个基于 React + TypeScript（前端）与 Node.js + Express + TypeScript（后端）、MongoDB 持久化，并集成 OpenAI API 的中文 AI 小说写作应用。支持：
- 逐章生成与续写（SSE 流式）
- 风格模仿/写作风格控制
- 记忆与一致性维护（世界观/事实/前情摘要/禁忌表，WIP）

## 技术栈
- 前端：React + TypeScript + Vite + Tailwind CSS + React Query
- 后端：Node.js + Express + TypeScript
- 数据库：MongoDB（Mongoose）
- AI：OpenAI API（流式生成）

## 仓库结构（规划）
```
ai-novel-writer/
  client/                 # 前端应用（Vite）
  server/                 # 后端服务（Express + TS）
  README.md
  .env.example            # 环境变量示例
```

## 快速开始（开发模式）
前置要求：Node.js >= 18，npm/pnpm，MongoDB 实例，OpenAI API Key。

1. 克隆仓库并安装依赖
```
# 在根目录（若采用单仓/双包结构，可在 client/ 与 server/ 各自安装）
npm install
```

2. 配置环境变量（复制 .env.example 为 .env，并填入以下字段）
```
# server 侧必填
OPENAI_API_KEY=sk-...
MONGODB_URI=mongodb://localhost:27017/ai-novel-writer
PORT=3001
# 可选
OPENAI_MODEL=gpt-4o-mini
```

3. 启动服务（示例脚本，具体以 package.json 为准）
```
# 启动后端（监听 http://localhost:3001）
npm run dev:server

# 启动前端（监听 http://localhost:5173）
npm run dev:client
```

4. 健康检查
- 后端：GET http://localhost:3001/health → { ok: true }
- 前端：打开 http://localhost:5173

> 注：若脚本名与端口与实际不一致，请以仓库内 package.json 与 .env 为准；后续任务会统一。

## Docker 一键启动（可选）
当提供 docker-compose.yml 后，可使用：
```
docker compose up -d
```
默认将启动 MongoDB、server、client 三个服务，并通过健康检查确保可用。

## 环境变量说明（后端）
- OPENAI_API_KEY：OpenAI 密钥，必填
- OPENAI_MODEL：默认 gpt-4o-mini，可按需调整
- MONGODB_URI：MongoDB 连接串，必填
- PORT：后端服务端口，默认 3001

## 核心能力与接口（MVP）
- 项目与风格配置
  - POST /api/projects：创建项目
  - GET /api/projects：项目列表
  - GET /api/projects/:id：项目详情
  - POST /api/projects/:id/style：保存风格配置

- 章节生成与续写（SSE 流式）
  - POST /api/projects/:id/chapters/generate：基于大纲/记忆/风格生成章节（返回 jobId）
  - POST /api/projects/:id/chapters/:chapterId/continue：续写既有章节（返回 jobId）
  - GET  /api/stream/:jobId：SSE 流推送事件：start、delta、progress、error、done

- 记忆与一致性（WIP）
  - GET /api/projects/:id/memory：读取项目记忆
  - POST /api/projects/:id/memory/sync：从章节抽取事实并合并

### SSE 客户端示例（前端）
```ts
// 获得 jobId 后，建立 SSE 连接
const es = new EventSource(`/api/stream/${jobId}`);
es.addEventListener('start', () => {/* ... */});
es.addEventListener('delta', (e) => {
  const chunk = e.data; // 追加显示
});
es.addEventListener('error', (e) => {/* 提示错误 */});
es.addEventListener('done', () => { es.close(); });
```

## 开发约定
- 所有接口与 UI 默认中文文案
- 生成长度、风格强度等参数需做边界校验
- 重要流程（生成/续写）使用 GenJob 记录状态、计费与耗时（WIP）

## 路线图（Roadmap）
- [ ] 初始化 server 与 client 脚手架与脚本统一
- [ ] MongoDB 模型：Project/Character/Memory/Chapter/StyleProfile/GenJob
- [ ] OpenAI 服务封装与流式工具
- [ ] 章节生成/续写 API + SSE 流
- [ ] 前端编辑器：流式预览、保存、续写
- [ ] 记忆抽取与同步管线
- [ ] 大纲生成与管理
- [ ] 人物卡与风格配置 UI
- [ ] Docker Compose 一键启动

## 许可
本项目暂未指定开源协议（可根据需要添加）。
