# syntax=docker/dockerfile:1
FROM node:20-alpine

WORKDIR /app

# 将源代码复制到容器中
COPY . .

# 如果存在 package.json，则安装依赖
RUN if [ -f package.json ]; then npm install; fi

EXPOSE 5173

CMD ["sh", "-c", "if [ -f package.json ]; then if node -e \"const fs=require('fs');const path='./package.json';if(!fs.existsSync(path)){process.exit(2);}const scripts=require(path).scripts||{};if(scripts[process.argv[1]]){process.exit(0);}process.exit(1);\" dev; then npm run dev -- --host 0.0.0.0; elif node -e \"const fs=require('fs');const path='./package.json';if(!fs.existsSync(path)){process.exit(2);}const scripts=require(path).scripts||{};if(scripts[process.argv[1]]){process.exit(0);}process.exit(1);\" start; then npm run start; else echo '未找到 dev 或 start 脚本，请在 client/package.json 中补充后重新启动容器。'; exit 1; fi; else echo 'client 目录缺少 package.json，请创建前端项目后再重新构建镜像。'; exit 1; fi"]
