// server.ts
import { Server } from 'socket.io';
import type { DisconnectReason, Socket } from 'socket.io';
import type { Server as BunServerType } from "bun";

// Используем эти типы для эмуляции Node.js Request/Response для Socket.IO
import { Readable } from 'stream'; // Из Node.js, но Bun имеет свою реализацию
import { EventEmitter } from 'events'; // Из Node.js, но Bun имеет свою реализацию

// Класс для эмуляции Node.js IncomingMessage
class MockIncomingMessage extends Readable {
  headers: Record<string, string | string[] | undefined> = {};
  method: string | undefined;
  url: string | undefined;
  connection: any;
  socket: any;

  constructor(bunRequest: Request) {
    super();
    this.method = bunRequest.method;
    const url = new URL(bunRequest.url);
    this.url = url.pathname + url.search;
    bunRequest.headers.forEach((value, key) => {
      const existing = this.headers[key.toLowerCase()];
      if (existing) {
        if (Array.isArray(existing)) {
          existing.push(value);
        } else {
          this.headers[key.toLowerCase()] = [existing, value];
        }
      } else {
        this.headers[key.toLowerCase()] = value;
      }
    });

    (async () => {
      if (bunRequest.body) {
        try {
            const arrayBuffer = await bunRequest.arrayBuffer();
            this.push(Buffer.from(arrayBuffer));
        } catch (e) {
            console.error("Error reading request body:", e);
        }
      }
      this.push(null);
    })();

    this.connection = this;
    this.socket = this;
  }
  override _read() {}
}

// Класс для эмуляции Node.js ServerResponse
class MockServerResponse extends EventEmitter {
  statusCode = 200;
  _headers: Record<string, string | string[] | undefined> = {};
  _body: Buffer[] = [];
  _ended = false;
  _headersSent = false;

  constructor() {
    super();
  }

  writeHead(statusCode: number, headers?: Record<string, string | string[] | undefined>) {
    if (this._headersSent) return;
    this.statusCode = statusCode;
    if (headers) {
      Object.assign(this._headers, headers);
    }
    this._headersSent = true;
  }

  setHeader(name: string, value: string | string[] | undefined) {
    this._headers[name.toLowerCase()] = value;
  }

  getHeader(name: string) {
    return this._headers[name.toLowerCase()];
  }

  getHeaders() {
    return this._headers;
  }

  removeHeader(name: string) {
    delete this._headers[name.toLowerCase()];
  }

  write(chunk: string | Buffer) {
    if (!this._headersSent) {
      this._implicitHeader();
    }
    this._body.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    return true;
  }

  end(chunk?: string | Buffer) {
    if (this._ended) return this;
    if (chunk) {
      this.write(chunk);
    }
    if (!this._headersSent) {
        this._implicitHeader();
    }
    this._ended = true;
    this.emit('finish');
    return this;
  }

  _implicitHeader() {
    if (!this._headersSent) {
      this.writeHead(this.statusCode);
    }
  }
}

const isDev = Bun.env.NODE_ENV === "dev";
const port = Number(Bun.env.PORT) || 3010;

let io: Server;

const bunHttpServer = Bun.serve({
  hostname: "0.0.0.0",
  port: port,
  // --- КЛЮЧЕВОЕ ИЗМЕНЕНИЕ ЗДЕСЬ ---
  websocket: {
    // Bun требует, чтобы этот объект существовал для поддержки WebSockets.
    // Обработчики здесь минимальны, так как Socket.IO сам возьмет на себя
    // управление WebSocket-соединением после server.upgrade(req).
    open() { /* console.log("[Bun WS] Opened"); */ },
    message() { /* console.log("[Bun WS] Message:", message); */ },
    close() { /* console.log("[Bun WS] Closed:", code, message); */ },
    error(error: any) { console.error("[Bun WS] Error:", error); },
    // maxPayloadLength: 1024 * 1024, // Необязательно: максимальный размер сообщения
    // idleTimeout: 20, // Необязательно: таймаут неактивности
  },
  fetch: async (req: Request, server: BunServerType<undefined>): Promise<Response | undefined> => {
    const url = new URL(req.url);

    // --- Интеграция Socket.IO ---
    if (url.pathname.startsWith("/socket.io/")) {
      // 1. Попытка upgrade для WebSocket
      // Теперь это будет работать, так как объект `websocket` присутствует.
      if (req.headers.get("upgrade") === "websocket" && server.upgrade(req)) {
        return;
      }

      // 2. Если это не upgrade (т.е. обычный HTTP-запрос для Socket.IO, например, polling)
      const mockReq = new MockIncomingMessage(req);
      const mockRes = new MockServerResponse();

      // Запускаем обработчик Socket.IO
      // @ts-ignore
      io.engine.handleRequest(mockReq, mockRes);

      await new Promise<void>(resolve => {
        if (mockRes._ended) {
          resolve();
        } else {
          mockRes.on('finish', resolve);
        }
      });

      const responseBody = Buffer.concat(mockRes._body);

      const bunHeaders = new Headers();
      for (const key in mockRes._headers) {
        const value = mockRes._headers[key];
        if (value !== undefined) {
          if (Array.isArray(value)) {
            value.forEach(v => bunHeaders.append(key, v));
          } else {
            bunHeaders.set(key, value);
          }
        }
      }

      return new Response(responseBody, {
        status: mockRes.statusCode,
        headers: bunHeaders,
      });
    }

    // --- Обработка статических файлов и корневого пути ---
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

    console.log(`[HTTP] 404: ${url.pathname}`);
    return new Response("404 Not Found", { status: 404 });
  },
} as any);

io = new Server();

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