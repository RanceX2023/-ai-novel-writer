# 项目说明

该仓库提供了前端（client）、后端（server）以及 MongoDB 的容器化开发与部署环境。通过 Docker Compose 可以快速启动完整的本地开发环境，同时也提供了生产部署所需的脚本与配置模版。

## 目录结构

```
.
├── client/                 # 前端代码目录（请自行放置实际项目）
│   ├── Dockerfile          # 前端镜像构建配置
│   └── .env.example        # 前端环境变量示例
├── server/                 # 后端代码目录（请自行放置实际项目）
│   ├── Dockerfile          # 后端镜像构建配置
│   └── .env.example        # 后端环境变量示例
├── scripts/                # 常用脚本
│   ├── build.sh            # 构建镜像脚本
│   └── up.sh               # 启动容器脚本
├── docker-compose.yml      # 本地开发默认配置
├── docker-compose.prod.yml # 生产环境覆盖配置
├── .env.example            # docker compose 级别变量示例
└── README.md
```

> **注意：** `client/` 与 `server/` 目录当前仅包含模版文件，请将各自的实际项目代码放到对应目录后再进行构建与部署。

## 环境依赖

- Docker 20.10+
- Docker Compose v2+

建议运行 `docker --version` 与 `docker compose version` 确认环境是否就绪。

## 环境变量配置

### 1. Docker Compose 级别变量

根目录下提供了 `.env.example`，复制后根据需要修改：

```bash
cp .env.example .env
```

常用变量说明：

| 变量名 | 默认值 | 说明 |
| ------ | ------ | ---- |
| `CLIENT_IMAGE` | `ai-novel-client` | 前端镜像名称/容器名称 |
| `SERVER_IMAGE` | `ai-novel-server` | 后端镜像名称/容器名称 |
| `CLIENT_PORT`  | `5173` | 本地暴露的前端端口 |
| `SERVER_PORT`  | `4000` | 本地暴露的后端端口 |
| `MONGO_PORT`   | `27017` | 本地暴露的 MongoDB 端口 |
| `MONGO_INITDB_ROOT_USERNAME` | `admin` | MongoDB 管理员用户名 |
| `MONGO_INITDB_ROOT_PASSWORD` | `changeme` | MongoDB 管理员密码 |
| `MONGO_DB_NAME` | `ai_novel_writer` | 默认数据库名称 |
| `SERVER_MONGO_URI` | `mongodb://admin:changeme@mongo:27017/ai_novel_writer?authSource=admin` | 后端使用的 Mongo 连接串 |
| `SERVER_JWT_SECRET` | `please-change-me` | 后端 JWT 密钥示例值 |

### 2. 前端环境变量

在 `client/` 目录中：

```bash
cp client/.env.example client/.env
```

示例字段：

| 变量名 | 默认值 | 说明 |
| ------ | ------ | ---- |
| `VITE_API_BASE_URL` | `http://localhost:4000` | 后端接口地址 |
| `VITE_APP_NAME` | `AI小说创作平台` | 前端展示名称 |
| `VITE_APP_ENV` | `development` | 环境标识 |
| `VITE_DEFAULT_PROJECT_ID` | *(空)* | 默认加载的项目 ID，用于章节编辑器 |

### 3. 后端环境变量

在 `server/` 目录中：

```bash
cp server/.env.example server/.env
```

示例字段：

| 变量名 | 默认值 | 说明 |
| ------ | ------ | ---- |
| `NODE_ENV` | `development` | 运行环境 |
| `PORT` | `4000` | 后端服务端口，应与 `SERVER_PORT` 保持一致 |
| `MONGO_URI` | `mongodb://admin:changeme@mongo:27017/ai_novel_writer?authSource=admin` | MongoDB 连接串 |
| `JWT_SECRET` | `please-change-me` | JWT 密钥，请尽快修改 |
| `CLIENT_ORIGIN` | `http://localhost:5173` | 允许的前端来源，用于 CORS |
| `LOG_LEVEL` | `info` | 日志级别 |

## 本地开发流程

1. **准备代码**：将前端与后端代码分别放入 `client/` 与 `server/` 目录。
2. **复制环境变量模板**：
   ```bash
   cp .env.example .env
   cp client/.env.example client/.env
   cp server/.env.example server/.env
   ```
3. **（可选）修改变量**：根据实际需求调整 `.env`、`client/.env` 与 `server/.env`。
4. **构建镜像**（首次启动或依赖更新时推荐执行）：
   ```bash
   ./scripts/build.sh
   ```
5. **启动开发环境**：
   ```bash
   ./scripts/up.sh
   ```
   默认以后台方式运行，可通过 `docker compose ps` 查看状态。若希望以前台方式运行，可执行 `./scripts/up.sh --fg`。
6. **停止服务**：
   ```bash
   docker compose down
   ```

### MongoDB 数据持久化

- MongoDB 数据默认持久化在名为 `mongo-data` 的 Docker 卷中。
- 可通过 `docker volume ls` 查看，也可在 `docker-compose.yml` 中修改卷名称。

## 生产部署指引

仓库提供了 `docker-compose.prod.yml` 用于覆盖生产环境设置（例如移除宿主机代码挂载，默认执行 `npm run start`），并提供脚本中的 `--prod/-p` 参数进行组合。

### 构建生产镜像

```bash
./scripts/build.sh --prod
```

### 启动生产环境

```bash
./scripts/up.sh --prod
```

脚本会自动加载 `docker-compose.yml` 与 `docker-compose.prod.yml`，确保启动配置完整。您仍然可以追加原生的 Docker Compose 参数，例如：

```bash
./scripts/up.sh --prod --fg --remove-orphans
```

### 自定义生产变量

- 复制 `.env.example` 到 `.env` 并填入生产环境值（请务必修改数据库密码、JWT 密钥等敏感信息）。
- 如需为前后端提供不同的 `.env` 文件，可在部署流程前将 `client/.env` 与 `server/.env` 通过 CI/CD 管理。

## 常见问题与排查

| 问题 | 可能原因 | 解决方案 |
| ---- | -------- | -------- |
| `ERROR: Couldn't find env file` | 未复制 `.env.example` 到 `.env` | 根据上文步骤创建所需的 `.env` 文件 |
| 容器启动后立即退出 | 项目中缺少 `package.json` 或脚本未定义 | 确认 `client/` 与 `server/` 目录存在完整的项目并包含正确的 npm 脚本 |
| 无法连接 MongoDB | 连接串或认证信息不正确 | 检查 `.env` / `server/.env` 中的 `MONGO_URI` 与管理员账号密码 |

## 后续工作建议

- 在前端项目中配置 `npm run dev`（或 `npm run start`）脚本，以适配当前 Dockerfile 默认命令。
- 在后端项目中至少提供 `npm run start`，并根据需要提供 `npm run start:dev`。
- 将数据库备份、日志采集等操作纳入 CI/CD 流程，实现完整的部署方案。
