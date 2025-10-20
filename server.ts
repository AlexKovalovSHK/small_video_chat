// server.ts
import type { ServerWebSocket } from "bun";

type ClientData = {
  id: string;
};

if (!process.env.NODE_ENV) {
  try {
    const dotenv = Bun.file(".env");
    if (await dotenv.exists()) {
      const text = await dotenv.text();
      for (const line of text.split("\n")) {
        const [key, ...value] = line.trim().split("=");
        if (key && !key.startsWith("#") && value !== undefined) {
          const val = value.join("=");
          process.env[key] = val;
          Bun.env[key] = val;
        }
      }
    }
  } catch (e) {
    // игнорируем, если .env нет
  }
}

const isDev = process.env.NODE_ENV === "dev";
const port = Number(process.env.PORT) || 3010;

const clients = new Map<string, ServerWebSocket<ClientData>>();

Bun.serve<ClientData>({
  hostname: "0.0.0.0",
  port: 3010,
  websocket: {
    open(ws) {
      const id = Math.random().toString(36).slice(2, 10);
      clients.set(id, ws);
      ws.data.id = id;
      console.log("Новый клиент:", id);
      ws.send(JSON.stringify({ yourId: id }));
    },
    message(ws, message) {
      try {
        const data = JSON.parse(message.toString());
        const target = clients.get(data.to);
        if (target && target.readyState === 1) {
          target.send(JSON.stringify({ from: ws.data.id, ...data }));
        }
      } catch (e) {
        console.error("Ошибка в сообщении:", e);
      }
    },
    close(ws) {
      clients.delete(ws.data.id);
      console.log("Клиент отключён:", ws.data.id);
    },
  },
  fetch(req, server) {
    const url = new URL(req.url);

    if (url.pathname === "/favicon.ico") {
      return new Response(null, { status: 204 });
    }

    if (url.pathname === "/") {
      return new Response(Bun.file("./public/index.html"));
    }

    if (url.pathname === "/ws") {
      const upgraded = server.upgrade(req, {
        data: { id: "" },
      });
      if (upgraded) return new Response();
    }

    if (url.pathname.startsWith("/public/")) {
      return new Response(Bun.file("." + url.pathname));
    }

    return new Response("404", { status: 404 });
  },
});

console.log("Сервер запущен на http://localhost:3010");
