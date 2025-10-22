// server.ts
import { Server } from 'socket.io';
import type { DisconnectReason, Socket } from 'socket.io';
import type { Server as BunServerType, HeadersInit } from "bun";

// Используем эти типы для эмуляции Node.js Request/Response для Socket.IO
import { Readable } from 'stream'; // Из Node.js, но Bun имеет свою реализацию
import { EventEmitter } from 'events'; // Из Node.js, но Bun имеет свою реализацию

// Класс для эмуляции Node.js IncomingMessage
class MockIncomingMessage extends Readable {
  headers: Record<string, string | string[] | undefined> = {};
  method: string | undefined;
  url: string | undefined;
  // Добавьте другие свойства, если Socket.IO их ожидает
  // Например, connection, socket
  connection: any; // Фиктивное свойство
  socket: any; // Фиктивное свойство

  constructor(bunRequest: Request) {
    super();
    this.method = bunRequest.method;
    const url = new URL(bunRequest.url);
    this.url = url.pathname + url.search;
    bunRequest.headers.forEach((value, key) => {
      this.headers[key] = value;
    });

    // Эмулируем тело запроса
    (async () => {
      if (bunRequest.body) {
        // Прочитаем тело как ArrayBuffer и затем как Buffer
        const arrayBuffer = await bunRequest.arrayBuffer();
        this.push(Buffer.from(arrayBuffer));
      }
      this.push(null); // Сигнализируем об окончании потока
    })();

    // Фиктивные свойства для работы Socket.IO
    this.connection = this; // Socket.IO может использовать connection/socket
    this.socket = this;
  }
  // Переопределяем _read, если необходимо, но для push-модели можно оставить пустым
  override _read() {}
}

// Класс для эмуляции Node.js ServerResponse
class MockServerResponse extends EventEmitter {
  statusCode = 200;
  _headers: Record<string, string | string[] | undefined> = {};
  _body: Buffer[] = [];
  _ended = false;

  constructor() {
    super();
  }

  writeHead(statusCode: number, headers?: Record<string, string | string[] | undefined>) {
    this.statusCode = statusCode;
    if (headers) {
      Object.assign(this._headers, headers);
    }
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
    this._body.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    return true;
  }

  end(chunk?: string | Buffer) {
    if (chunk) {
      this.write(chunk);
    }
    this._ended = true;
    this.emit('finish'); // Сигнализируем о завершении ответа
    return this;
  }

  // Socket.IO может ожидать эти методы
  _implicitHeader() {
    // Делаем что-то, если Socket.IO пытается выставить неявные заголовки
  }
}

const isDev = Bun.env.NODE_ENV === "dev";
const port = Number(Bun.env.PORT) || 3010;

let io: Server;

const bunHttpServer = Bun.serve({
  hostname: "0.0.0.0",
  port: port,
  fetch: async (req: Request, server: BunServerType<undefined>): Promise<Response | undefined> => {
    const url = new URL(req.url);

    // --- Интеграция Socket.IO ---
    if (url.pathname.startsWith("/socket.io/")) {
      // 1. Попытка upgrade для WebSocket
      if (server.upgrade(req)) {
        // Если успешно апгрейднуто, Bun берет управление на себя для WebSocket.
        // Здесь не нужно возвращать Response.
        return;
      }

      // 2. Если это не upgrade (т.е. обычный HTTP-запрос для Socket.IO, например, polling)
      // Эмулируем Node.js req/res для Socket.IO.engine.handleRequest
      const mockReq = new MockIncomingMessage(req);
      const mockRes = new MockServerResponse();

      // Запускаем обработчик Socket.IO
      // @ts-ignore - Socket.IO может не знать о MockIncomingMessage/MockServerResponse
      io.engine.handleRequest(mockReq, mockRes);

      // Ждем, пока Socket.IO завершит запись в mockRes
      await new Promise<void>(resolve => {
        // Если Socket.IO уже завершил ответ (редко, но бывает), завершим сразу
        if (mockRes._ended) {
          resolve();
        } else {
          mockRes.on('finish', resolve);
        }
      });

      // Собираем тело ответа
      const responseBody = Buffer.concat(mockRes._body);

      const bunHeaders = new Headers();
      for (const key in mockRes._headers) {
        const value = mockRes._headers[key];
        if (value !== undefined) { // Игнорируем undefined заголовки
          if (Array.isArray(value)) {
            value.forEach(v => bunHeaders.append(key, v));
          } else {
            bunHeaders.set(key, value);
          }
        }
      }

      // Создаем Bun Response из эмулированного Node.js ответа
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

// Socket.IO теперь должен быть инициализирован
// В конструктор Socket.IO Server передается либо порт, либо HTTP-сервер Node.js.
// Поскольку у нас Bun.serve, а не Node.js http.Server,
// мы не можем просто передать `bunHttpServer` напрямую.
// Самый простой способ обойти типизацию здесь, если мы уверены, что
// Socket.IO >= 4.0.0 может работать с Bun.serve через `io.engine.handleRequest`
// для HTTP-части и `server.upgrade` для WebSocket-части, это
// создать Socket.IO сервер, который *не слушает сам* на HTTP-порту.
// И затем использовать io.attach(bunHttpServer) - но это снова требует http.Server.

// **По-настоящему, если Socket.IO v4+ и Bun, и нужен один порт:**
// 1. Создайте `io = new Server();` (без аргументов). Это создает Socket.IO сервер
//    без привязки к HTTP-серверу или порту.
// 2. В `fetch` обработчике, вы уже перехватываете `/socket.io/` и
//    обрабатываете его через `server.upgrade(req)` и `io.engine.handleRequest`.
// 3. Socket.IO сам найдет свой путь к этим запросам.
// 4. Ошибки типизации `No overload matches this call` не будет,
//    потому что вы не передаете ничего, что вызывает конфликт.

// --- Итоговое, ОЧЕНЬ УПРОЩЕННОЕ ИСПРАВЛЕНИЕ ---
// Это удалит ошибку типизации и будет использовать Bun.serve как главный HTTP-сервер.
io = new Server(); // Создаем экземпляр без привязки к HTTP-серверу

// Оставьте остальной код как есть.
// `io.engine.handleRequest` и `server.upgrade(req)` в `fetch`
// теперь будут обрабатывать Socket.IO трафик.

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