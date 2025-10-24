# syntax=docker/dockerfile:1
FROM node:20-alpine

WORKDIR /app

COPY . .

RUN if [ -f package.json ]; then npm install; fi

EXPOSE 4000

CMD ["sh", "-c", "if [ -f package.json ]; then if node -e \"const fs=require('fs');const path='./package.json';if(!fs.existsSync(path)){process.exit(2);}const scripts=require(path).scripts||{};if(scripts[process.argv[1]]){process.exit(0);}process.exit(1);\" start:dev; then npm run start:dev; elif node -e \"const fs=require('fs');const path='./package.json';if(!fs.existsSync(path)){process.exit(2);}const scripts=require(path).scripts||{};if(scripts[process.argv[1]]){process.exit(0);}process.exit(1);\" start; then npm run start; else echo '未找到 start 或 start:dev 脚本，请在 server/package.json 中补充后重新启动容器。'; exit 1; fi; else echo 'server 目录缺少 package.json，请创建后端项目后再重新构建镜像。'; exit 1; fi"]
