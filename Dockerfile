# Dockerfile
FROM oven/bun:1 AS base
WORKDIR /app

# Копируем зависимости (если есть)
COPY package.json bun.lock ./

# Устанавливаем (даже если пусто — безопасно)
RUN bun install --production

# Копируем исходники
COPY . .

# Экспонируем порт
EXPOSE 3010

# Запускаем сервер
CMD ["bun", "run", "server.ts"]