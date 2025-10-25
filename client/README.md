# 前端：章节生成流式预览

该前端实现了基于 React + Tailwind CSS 的小说章节编辑体验，支持通过 SSE（Server-Sent Events）实时预览章节生成/续写过程，并在完成后保存至后端。主要特性：

- `/project/:projectId` 编辑器页，左侧展示项目大纲与记忆片段，右侧提供生成参数与版本历史。
- 通过 `POST /api/projects/:id/chapters/generate`、`POST /api/projects/:id/chapters/:chapterId/continue` 发起任务，并使用 `GET /api/stream/:jobId` 持续获取 `start`、`delta`、`progress`、`error`、`done` 等事件。
- 生成结果支持一键保存（`PATCH /api/projects/:id/chapters/:chapterId`），续写会自动追加到当前章节，并刷新版本列表。
- React Query 统一管理数据请求与缓存，Toast 提示错误与状态更新，Tailwind CSS 打造响应式中文界面。

## 快速开始

```bash
cd client
pnpm install  # 或 npm install / yarn install
pnpm dev      # 默认启动在 http://localhost:5173
```

> **提示**：请确保根目录 `.env`、`client/.env`、`server/.env` 已按照模板填好，前端需在 `.env` 中设置 `VITE_API_BASE_URL`（后端地址）与 `VITE_DEFAULT_PROJECT_ID`（默认项目 ID）。

## 联通后端的本地演示

1. 启动后端与 MongoDB（推荐使用仓库根目录提供的 Docker Compose 环境）：
   ```bash
   ./scripts/up.sh --fg
   ```

2. 在后端数据库中创建项目、章节大纲与记忆片段（可通过已有脚本或手动插入）。记下项目 ID，并填入 `client/.env` 的 `VITE_DEFAULT_PROJECT_ID`。

3. 启动前端：
   ```bash
   cd client
   pnpm dev
   ```

4. 浏览器访问 `http://localhost:5173/project/<项目ID>`：
   - 点击左侧大纲节点后执行 “生成章节”，2 秒内可见流式输出；
   - 对已有章节点击 “续写” 会将新内容追加到正文，并刷新版本列表；
   - 生成结束后点击 “保存” 持久化正文，刷新页面仍可查看。

5. 如果网络断开或生成失败，Toast 会提示错误，重新点击按钮即可重新发起任务。

## 运行测试

前端使用 Vitest + Testing Library 覆盖基础组件与关键交互：

```bash
pnpm test
```

## 主要技术栈

- React 18、React Router 6、React Query 5
- Tailwind CSS 3，支持暗色系中文界面
- SSE（EventSource）用于处理章节生成流
- Vitest + @testing-library/react 用于组件测试

如需进一步自定义样式或国际化，可在 `tailwind.config.js` 与对应组件中调整。
