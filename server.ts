// server.ts
import { Server } from 'socket.io';
import type { DisconnectReason, Socket } from 'socket.io';
import type { Server as BunServerType, WebSocketHandler } from "bun"; // Импортируем WebSocketHandler
import type { Server as HttpServerType } from 'http';

const isDev = Bun.env.NODE_ENV === "dev";
const port = Number(Bun.env.PORT) || 3010;

let io: Server;

const bunHttpServer = Bun.serve({
  hostname: "0.0.0.0",
  port: port,
  websocket: {} as WebSocketHandler<undefined>,
  fetch: async (req: Request, server: BunServerType<undefined>): Promise<Response | undefined> => {
    const url = new URL(req.url);

    // Логика для статических файлов
    if (url.pathname === "/favicon.ico") {
      return new Response(null, { status: 204 });
    }

    if (url.pathname === "/") {
      return new Response(Bun.file("./public/index.html"));
    }

    if (url.pathname.startsWith("/public/")) {
      const filePath = "." + url.pathname;
      try {
        const file = Bun.file(filePath);
        return new Response(file);
      } catch (error) {
        console.warn(`[HTTP] Ошибка при отдаче статического файла ${filePath}:`, error);
        return new Response("File not found", { status: 404 });
      }
    }

    if (url.pathname.startsWith("/socket.io/")) {
      return; // Позволяем Socket.IO обрабатывать свои пути
    }

    console.log(`[HTTP] 404: ${url.pathname}`);
    return new Response("404 Not Found", { status: 404 });
  },
});

io = new Server(bunHttpServer as unknown as HttpServerType, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    },
});

io.on('connection', (socket: Socket) => {
  const id = socket.id;
  console.log(`[Socket.IO] Клиент подключен: ${id}. Всего клиентов: ${io.engine.clientsCount}`);

  socket.emit('yourId', id);

  socket.on('message', (data: any) => {
    try {
      const targetSocket = io.sockets.sockets.get(data.to);
      if (targetSocket) {
        targetSocket.emit('message', { from: socket.id, ...data });
      } else {
        console.warn(`[Socket.IO] Целевой клиент ${data.to} не найден или не готов.`);
        socket.emit("error", { message: `Peer ${data.to} not found or not ready.` });
      }
    } catch (e) {
      console.error(`[Socket.IO] Ошибка в сообщении от ${socket.id}:`, e, `Сообщение:`, data);
      socket.emit("error", { message: "Invalid message format." });
    }
  });

  socket.on('disconnect', (reason: DisconnectReason) => {
    console.log(`[Socket.IO] Клиент отключен: ${socket.id}. Причина: ${reason}. Всего клиентов: ${io.engine.clientsCount}`);
  });

  socket.on('error', (error: Error) => {
    console.error(`[Socket.IO] Ошибка сокета ${socket.id}:`, error);
  });
});

console.log(`Сервер запущен на http://${bunHttpServer.hostname}:${bunHttpServer.port}`);
console.log(`Режим разработки: ${isDev ? 'да' : 'нет'}`);