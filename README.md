# AI 小说创作平台：Docker 一键启动环境

该仓库集成了前端（Vite + React）、后端（Node.js + Express + TypeScript）与 MongoDB 的容器化开发环境。通过一份 `.env` 配置即可完成服务编排，方便团队成员或体验者快速启动完整的本地环境，验证「前端 ⇄ 后端 ⇄ 数据库」的基础流程。

## 🚀 快速开始

1. 复制根目录示例配置：
   ```bash
   cp .env.example .env
   ```
2. 按需编辑 `.env`，至少确认：
   - `OPENAI_KEY_SECRET`：任意 32+ 字符的加密密钥；
   - `OPENAI_API_KEY`（可选）：用于首次启动时自动写入数据库的 OpenAI Key；
   - 其他端口或 MongoDB 账号按需修改。
3. 构建并启动全部服务：
   ```bash
   docker compose up --build
   ```
   或者使用项目脚本（默认后台运行）：
   ```bash
   ./scripts/up.sh
   ```
4. 浏览器访问：
   - 前端：<http://localhost:5173>
   - 后端健康检查：<http://localhost:4000/health>

首次启动会自动：
- 创建名为 `mongo-data` 的数据卷，保证 MongoDB 数据在停止/重启容器后仍然保留；
- 在检测到 `OPENAI_API_KEY` 且数据库中不存在同名 alias 时，将密钥加密后写入库中，开箱即可体验生成流程。

## 🧩 服务一览

| 服务      | 默认端口 (宿主机) | 描述 |
|-----------|-------------------|------|
| `client`  | `5173`            | Vite 开发服务器，提供前端页面与实时热更新 |
| `server`  | `4000`            | Express API 服务，连通 Mongo 并负责 AI 相关逻辑 |
| `mongo`   | `27017`           | MongoDB 6.0，使用持久化数据卷 `mongo-data` |

> Docker Compose 已配置健康检查：`mongo` 通过 `mongosh ping`、`server` 轮询 `/health`，保证依赖顺序正确。`client` 会等待后端健康后再启动。

## ⚙️ 环境变量

### 根目录 `.env`

根目录 `.env.example` 已列出常用变量。复制后可按照下表进行调整：

| 变量名 | 默认值 | 说明 |
| ------ | ------ | ---- |
| `CLIENT_PORT` / `SERVER_PORT` | `5173` / `4000` | 对外暴露的端口，可避免与本地已有服务冲突 |
| `MONGODB_URI` | `mongodb://admin:changeme@mongo:27017/ai_novel_writer?authSource=admin` | 后端连接 MongoDB 使用的 URI，同步写入 `MONGO_URI` 方便复用 |
| `OPENAI_KEY_SECRET` | `please-change-me` | 用于加密/解密存储在数据库中的 OpenAI Key，务必在生产环境修改 |
| `OPENAI_API_KEY` | *(空)* | 可选，填入后第一次启动会自动写入数据库（alias 默认 `default`） |
| `VITE_API_BASE_URL` | `http://localhost:4000` | 前端调用后端的基础地址 |
| `JWT_SECRET`、`OPENAI_*` | 详见示例 | 后端业务配置，可根据需要调整 |

> 若希望自定义前端/后端的运行参数（如 `VITE_APP_NAME`、`OPENAI_DEFAULT_MODEL`），同样可通过 `.env` 覆盖。

### 可选：源码层调试

- `client/.env.example` 与 `server/.env.example` 仍然保留，方便在不使用 Docker 时直接 `npm run dev`；
- Docker Compose 已不再依赖这些文件，可按需复制。

## 💾 数据持久化

- MongoDB 数据位于 Docker 卷 `mongo-data` 中，重启容器不会丢失；
- 如需重置数据库，可执行 `docker compose down -v` 或 `docker volume rm mongo-data`（谨慎操作，数据会被清空）。

## 🛠️ 常用脚本

| 命令 | 作用 |
| ---- | ---- |
| `./scripts/build.sh` | 构建所有服务镜像（开发态，使用热更新镜像） |
| `./scripts/build.sh --prod` | 使用生产阶段镜像（`docker-compose.prod.yml`）进行构建 |
| `./scripts/up.sh` | 以后台模式启动所有服务（默认开发态） |
| `./scripts/up.sh --fg` | 以前台模式输出日志，方便调试 |
| `./scripts/up.sh --prod` | 结合生产覆盖配置启动，前端将以 Nginx 静态服务的形式运行 |

停止服务：
```bash
docker compose down
```
如需保留数据库数据，可省略 `-v` 参数。

## 📦 生产模式（可选）

`docker-compose.prod.yml` 通过覆盖实现：
- 使用 Dockerfile 中的 `production` 阶段镜像（后端运行已编译的 `dist`，前端由 Nginx 提供静态文件）；
- 移除源码挂载卷，容器重启即完成热更新；
- `client` 暴露到宿主机的依然是 `5173` 端口（映射到容器内 Nginx 的 80 端口）。

启动示例：
```bash
./scripts/up.sh --prod --fg
```

## ❗ 常见问题与排查

| 现象 | 排查方向 |
| ---- | -------- |
| `OPENAI_KEY_SECRET must be configured` | `.env` 中未设置 `OPENAI_KEY_SECRET`；复制 `.env.example` 后重新启动 |
| `OPENAI API keys are not configured` | 未在数据库中写入 Key：可设置 `OPENAI_API_KEY` 后重新 `docker compose up`，或通过后端 API 管理界面添加 |
| `mongo` 容器反复重启 | 检查 `.env` 中的 Mongo 账户/密码是否匹配，或确认宿主机未占用 `MONGO_PORT` |
| 前端无法联通后端 | 确认 `.env` 中 `VITE_API_BASE_URL` 指向正确，后端 `/health` 状态为 `ok` |

如需进一步调试，可查看各容器日志：
```bash
docker compose logs -f server
# 或
./scripts/up.sh --fg
```

---

现在，运行 `docker compose up` 就能体验完整的 AI 小说创作链路，尽情探索吧！
