# AI 小说写作（Web）

一个基于 React + TypeScript（前端）与 Node.js + Express + TypeScript（后端）、MongoDB 持久化，并集成 OpenAI API 的中文 AI 小说写作应用，旨在帮助创作者快速构建具有一致世界观与角色设定的长篇小说。系统在 MVP 阶段即聚焦于章节级生成与快速迭代体验，通过前后端协同与流式生成能力，为作家提供沉浸式的创作流程。

当前规划的能力包括：
- 逐章生成与续写（SSE 流式输出，实时展示生成进度）
- 风格模仿/写作风格控制（支持多维度参数配置）
- 记忆与一致性维护（世界观/事实/前情摘要/禁忌表，WIP）
- 统一的项目管理与素材组织能力（角色卡、世界观、章节依赖等）

## 技术栈
- 前端：React + TypeScript + Vite + Tailwind CSS + React Query（对应的状态管理与 API 缓存方案）
- 后端：Node.js + Express + TypeScript（借助 ts-node-dev / nodemon 提供开发态热重载）
- 数据库：MongoDB（Mongoose 负责 Schema 与数据访问层）
- AI：OpenAI API（采用流式生成接口，计划封装通用 Prompt & 记忆拼接逻辑）
- 其他：ESLint / Prettier（统一代码风格），Jest / Vitest（规划中的测试框架）

## 仓库结构（规划）
```
ai-novel-writer/
  client/                 # 前端应用（Vite + React + TS）
    src/                  # 页面、组件、hooks
    public/               # 静态资源
  server/                 # 后端服务（Express + TS）
    src/                  # API、服务、数据层
    tests/                # 单元测试与集成测试（预留）
  README.md
  .env.example            # 环境变量示例（根目录，供 docker / 本地脚本参考）
```
> 注：MVP 阶段为单仓多包结构，后续可能根据复杂度拆分子仓库或引入 Turborepo 等工具。

## 快速开始（开发模式）
前置要求：Node.js >= 18、npm/pnpm、可用 MongoDB 实例、可用 OpenAI API Key。建议确保网络可访问 OpenAI，并在本地安装 `pnpm` 以获得更快的依赖安装速度（也可使用 npm）。

1. 克隆仓库并安装依赖
```
git clone https://github.com/your-org/ai-novel-writer.git
cd ai-novel-writer

# 在根目录安装 Workspace 依赖（推荐）
pnpm install
# 或按需分别进入 client/ 与 server/ 目录安装
```

2. 配置环境变量（复制 .env.example 为 .env，并按需覆盖）
```
# server 侧必填
OPENAI_API_KEY=sk-...
MONGODB_URI=mongodb://localhost:27017/ai-novel-writer

# 可选：覆盖默认端口 / 模型
PORT=3001
OPENAI_MODEL=gpt-4o-mini
OPENAI_ALLOWED_MODELS=gpt-4o-mini,gpt-4o
# 如需使用 OpenAI 代理，设置自定义基址
OPENAI_BASE_URL=
# 如需允许请求头覆盖密钥，设置为 true（默认为 false）
ALLOW_RUNTIME_KEY_OVERRIDE=false
```
> 若前端需要自定义后端地址，可在 `client/.env` 中设置 `VITE_API_BASE_URL`，默认指向 `http://localhost:3001`。

3. 启动服务（示例脚本，具体以 package.json 为准）
```
# 启动后端（监听 http://localhost:3001）
pnpm run dev:server

# 启动前端（监听 http://localhost:5173）
pnpm run dev:client
```
> 若脚本命名不同，请以仓库内 package.json 为准；后续任务会统一命名与工作流。

4. 健康检查与调试
- 后端：GET http://localhost:3001/health → 返回 `{ status: 'ok', mongo: 'connected', model: '当前默认模型' }` 等字段代表服务就绪
- 前端：访问 http://localhost:5173，确认可加载登录/项目列表界面
- MongoDB：使用 `mongosh` 或 GUI 工具检查 `ai-novel-writer` 数据库是否连通
- OpenAI：首次调用章节生成接口时若返回鉴权失败，请确认环境变量配置正确

5. 常见开发技巧
- 建议在 VS Code 中安装 ESLint、Prettier 插件，保存时自动格式化
- 对于 SSE 调试，可在浏览器 Network 面板中查看事件流，或使用 `curl -N`
- 如需并行运行前后端，可在独立终端中执行对应脚本

## Docker 一键启动（可选）
当仓库提供 `docker-compose.yml` 后，可通过以下方式一次性拉起全部服务：
```
docker compose up -d
```
- 默认启动 MongoDB、server、client 三个服务
- `server` 与 `client` 会在启动时执行健康检查，确保依赖服务（如 Mongo）已经就绪
- 日志查看：`docker compose logs -f server` / `docker compose logs -f client`
- 停止服务：`docker compose down`（保留数据卷）或 `docker compose down -v`（清除数据）
> 若需要覆盖端口或环境变量，可在 `.env` 中修改并重新启动容器。

## 环境变量说明（后端）
| 变量名 | 默认值 | 说明 |
| ------ | ------ | ---- |
| `OPENAI_API_KEY` | *(必填)* | OpenAI 密钥，用于生成章节、续写等功能 |
| `OPENAI_MODEL` | `gpt-4o-mini` | 默认的模型名称，可根据账号权限调整 |
| `OPENAI_ALLOWED_MODELS` | 同上 | 允许在前端下拉中选择的模型白名单（逗号分隔），会自动包含 `OPENAI_MODEL` |
| `OPENAI_BASE_URL` | *(空)* | 可选的 OpenAI API 代理/企业网关地址，留空则使用官方基址 |
| `ALLOW_RUNTIME_KEY_OVERRIDE` | `false` | 是否允许请求头 `X-OpenAI-Key` 临时覆盖密钥；启用后日志与响应会自动脱敏 |
| `MONGODB_URI` | `mongodb://localhost:27017/ai-novel-writer` | MongoDB 连接串，建议在生产环境中启用鉴权 |
| `PORT` | `3001` | 后端服务监听端口 |
| `OPENAI_TIMEOUT_MS` | `60000`（建议值） | 与 OpenAI API 通信的超时时长（可选） |
| `LOG_LEVEL` | `info` | 日志等级：`debug`/`info`/`warn`/`error` |

> 当前重点维护后端环境变量，前端环境变量（如 `VITE_API_BASE_URL`、`VITE_APP_TITLE`）可根据实际需求自行补充。

## 自定义模型 / 端口 / 密钥
- `PORT` 环境变量控制后端监听端口，`.env.example` 与 `docker-compose.yml` 已同步更新。
- 通过 `OPENAI_MODEL` + `OPENAI_ALLOWED_MODELS` 管理默认模型与白名单，前端会从 `GET /api/config` 动态拉取并渲染下拉选项，风格设定可为项目单独指定模型。
- 若配置 `OPENAI_BASE_URL`，OpenAI SDK 会使用自定义基址，可用于企业代理或网络隔离场景。
- 将 `ALLOW_RUNTIME_KEY_OVERRIDE` 设为 `true` 后，客户端可在请求头携带 `X-OpenAI-Key` 临时覆盖密钥（仅本次请求），日志会自动掩码该字段。
- `/health` 接口会返回当前默认模型，方便在多环境部署时核对配置。

## 核心能力与接口（MVP）

### 项目与风格配置
- `POST /api/projects`：创建项目，传入项目标题、简介（可选初始风格配置）。
- `GET /api/projects`：获取项目列表，支持分页与状态筛选（预留）。
- `GET /api/projects/:id`：获取单个项目详情，包含章节概览、记忆摘要等。
- `GET /api/config`：返回当前默认模型、白名单以及是否启用运行时密钥覆盖。
- `POST /api/projects/:id/style`：保存/更新项目风格配置，字段包括语气、节奏、背景设定等。

### 章节生成与续写（SSE 流式）
- `POST /api/projects/:id/chapters/generate`：基于大纲、记忆与风格生成章节。请求示例：
```json
{
  "outline": "第 1 章：主角偶遇神秘人，获得关键线索",
  "styleOverrides": {
    "tone": "古风",
    "narrativePace": "medium"
  }
}
```
返回 `{ "jobId": "gen_123" }`，客户端需通过 SSE 获取生成文本。

- `POST /api/projects/:id/chapters/:chapterId/continue`：对指定章节续写，支持传入最后一段文本以增强上下文。
- `GET /api/stream/:jobId`：建立 SSE 连接，事件包含：
  - `start`：任务开始，携带章节/项目元信息
  - `delta`：流式追加内容（字符串）
  - `progress`：进度更新（百分比或分块索引）
  - `error`：异常信息（包含消息与错误码）
  - `done`：任务结束（附带最终统计信息，如 tokens、耗时）

### 记忆与一致性（WIP）
- `GET /api/projects/:id/memory`：读取项目记忆（世界观、角色关系、事实摘要）。
- `POST /api/projects/:id/memory/sync`：从章节抽取事实并合并入记忆池，计划支持自动冲突检测与人工确认。

### SSE 客户端示例（前端）
```ts
// 获得 jobId 后，建立 SSE 连接
type StreamEvent = {
  data: string;
};

const es = new EventSource(`/api/stream/${jobId}`);

es.addEventListener('start', () => {
  // 初始化状态，例如显示加载动画
});

es.addEventListener('delta', (event: StreamEvent) => {
  const chunk = event.data;
  setChapterDraft((prev) => prev + chunk); // 追加展示文本
});

es.addEventListener('progress', (event: StreamEvent) => {
  const payload = JSON.parse(event.data);
  updateProgress(payload.percent);
});

es.addEventListener('error', () => {
  showToast('生成失败，请稍后重试');
  es.close();
});

es.addEventListener('done', () => {
  finalizeDraft();
  es.close();
});
```
> 对于需要携带鉴权信息的场景，可改用浏览器 `fetch` + `ReadableStream`，或在后端为 EventSource 路径注入 Cookie/JWT。

## 开发约定
- 所有接口与 UI 文案默认使用中文，确保目标用户体验一致。
- 生成长度、温度、风格强度等参数需做边界校验（后端负责约束，前端给出合理输入范围）。
- 重要流程（生成/续写）使用 `GenJob` 记录状态、耗时、OpenAI 计费信息（WIP）。
- 前后端统一使用 TypeScript，定义共享类型（可考虑放置在 `server/src/types` 与 `client/src/types`）。
- 提交代码前需通过 Lint/Format 检查；后续将补充 CI 以自动化校验。

## 路线图（Roadmap）
- [ ] 初始化 server 与 client 脚手架并统一脚本/依赖管理
- [ ] MongoDB 模型：Project / Character / Memory / Chapter / StyleProfile / GenJob
- [ ] OpenAI 服务封装与流式工具（含 Prompt 模板管理）
- [ ] 章节生成/续写 API + SSE 流整合
- [ ] 前端编辑器：章节草稿实时预览、保存、续写入口
- [ ] 记忆抽取与同步管线，支持人工校对
- [ ] 大纲生成与管理页面（章节排序、分支线规划）
- [ ] 人物卡与风格配置 UI（模板库、预设曲线）
- [ ] Docker Compose 一键启动与生产部署指引

## 许可
本项目暂未指定开源协议（可根据需要添加）。如需开源，请在后续版本中补充明确的 License 文件。
