# syntax=docker/dockerfile:1

FROM node:20-alpine AS base
WORKDIR /app

COPY package*.json ./
RUN if [ -f package-lock.json ]; then npm ci; else npm install; fi

FROM base AS build
COPY . .
RUN npm run build

FROM base AS development
WORKDIR /app
ENV NODE_ENV=development
COPY --from=base /app/node_modules ./node_modules
COPY . .
EXPOSE 5173
CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0", "--port", "5173"]

FROM nginx:alpine AS production
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
