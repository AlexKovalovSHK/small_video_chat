// server.ts
import type { ServerWebSocket } from "bun";
import TelegramBot from 'node-telegram-bot-api';

type ClientData = {
  id: string;
};

// Загрузка .env файла
if (!process.env.NODE_ENV || process.env.NODE_ENV === 'dev') {
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
    console.warn("Ошибка при загрузке .env файла:", e);
  }
}

const isDev = process.env.NODE_ENV === "dev";
const port = Number(process.env.PORT) || 3010;

const clients = new Map<string, ServerWebSocket<ClientData>>();
const telegramToWebRtcIdMap = new Map<number, string>();

// --- TELEGRAM BOT WEBHOOKS ИНТЕГРАЦИЯ ---
const TELEGRAM_BOT_TOKEN = Bun.env.TELEGRAM_BOT_TOKEN;
const WEBRTC_SERVER_BASE_URL = Bun.env.WEBRTC_SERVER_URL || 'https://webrtc-bun.shk.solutions';
const TELEGRAM_WEBHOOK_PATH = '/telegram-webhook';
const TELEGRAM_WEBHOOK_URL = `${WEBRTC_SERVER_BASE_URL}${TELEGRAM_WEBHOOK_PATH}`;

let bot: TelegramBot;

if (!TELEGRAM_BOT_TOKEN) {
  console.error('Ошибка: TELEGRAM_BOT_TOKEN не установлен. Webhook Telegram бота не будет работать.');
} else {
  bot = new TelegramBot(TELEGRAM_BOT_TOKEN);

  // Исправление 1: Правильное использование setWebHook
  bot.setWebHook(TELEGRAM_WEBHOOK_URL, {
    drop_pending_updates: true
  } as any)
    .then(() => {
      console.log(`🎉 Telegram webhook установлен на: ${TELEGRAM_WEBHOOK_URL}`);
      return bot.getMe();
    })
    .then((me) => {
      console.log(`Telegram бот запущен: @${me.username}`);
    })
    .catch((e: Error) => {
      console.error(`❌ Ошибка установки Telegram webhook: ${e.message}`);
    });

  // Обработчик команды /start
  bot.onText(/\/start/, (msg) => {
    const chatId = msg.chat.id;
    bot.sendMessage(chatId,
      'Привет! Я бот для видеозвонков. 📞\n\n' +
      'Чтобы начать:\n' +
      `1. Открой эту страницу в браузере: ${WEBRTC_SERVER_BASE_URL}\n` +
      '2. Разреши доступ к камере и микрофону.\n' +
      '3. Нажми кнопку "Привязать Telegram ID" и введи свой Telegram User ID (его можно узнать, отправив мне /mytelegramid).\n' +
      '4. После этого отправь мне команду /getlink, чтобы получить ссылку-приглашение для друга.'
    );
  });

  // Обработчик команды /getlink
  bot.onText(/\/getlink/, async (msg) => {
    const chatId = msg.chat.id;
    const telegramUserId = msg.from?.id;

    if (!telegramUserId) {
      bot.sendMessage(chatId, 'Не могу получить ваш Telegram User ID. Пожалуйста, попробуйте еще раз.');
      return;
    }

    try {
      const response = await fetch(`${WEBRTC_SERVER_BASE_URL}/get-webrtc-id?telegramUserId=${telegramUserId}`);

      if (response.ok) {
        // Исправление 2: Правильная типизация для data
        const data = await response.json() as { webrtcId?: string; error?: string };
        if (data.webrtcId) {
          const inviteLink = `${WEBRTC_SERVER_BASE_URL}/?join=${data.webrtcId}`;
          bot.sendMessage(chatId,
            `🚀 Ваша ссылка-приглашение для видеозвонка:\n\`${inviteLink}\`\n\n` +
            `Отправьте ее другу. Если вы еще не привязали свой ID, пожалуйста, зайдите на страницу ${WEBRTC_SERVER_BASE_URL} и нажмите "Привязать Telegram ID" (ваш Telegram User ID: \`${telegramUserId}\`).`,
            { parse_mode: 'Markdown' }
          );
        } else {
          bot.sendMessage(chatId,
            `🤔 Не удалось получить активный WebRTC ID. Пожалуйста, убедитесь, что вы открыли страницу ${WEBRTC_SERVER_BASE_URL}, разрешили доступ к камере и микрофону и нажали "Привязать Telegram ID", используя ваш Telegram User ID: \`${telegramUserId}\`.`,
            { parse_mode: 'Markdown' }
          );
        }
      } else {
        // Исправление 3: Правильная типизация для errorData
        const errorData = await response.json() as { error?: string };
        console.error('Ошибка при запросе WebRTC ID от Bun-сервера (внутри бота):', response.status, errorData);
        bot.sendMessage(chatId,
          `❌ Произошла ошибка при получении вашего ID. ${errorData.error || ''}\n` +
          `Убедитесь, что вы открыли страницу ${WEBRTC_SERVER_BASE_URL} и привязали свой Telegram ID: \`${telegramUserId}\`.`,
          { parse_mode: 'Markdown' }
        );
      }
    } catch (error: unknown) {
      // Исправление 4: Безопасное извлечение сообщения об ошибке
      const errorMessage = error instanceof Error ? error.message : 'Неизвестная ошибка';
      console.error('❌ Ошибка сети или сервера при запросе WebRTC ID (внутри бота):', errorMessage);
      bot.sendMessage(chatId, 'Произошла ошибка при подключении к WebRTC сервису. Возможно, сервер недоступен.');
    }
  });

  // Обработчик на /mytelegramid
  bot.onText(/\/mytelegramid/, (msg) => {
    const chatId = msg.chat.id;
    const telegramUserId = msg.from?.id;
    if (telegramUserId) {
      bot.sendMessage(chatId, `Ваш Telegram User ID: \`${telegramUserId}\`\n\nИспользуйте его для привязки на странице видеозвонка.`, { parse_mode: 'Markdown' });
    } else {
      bot.sendMessage(chatId, 'Не могу получить ваш Telegram User ID.');
    }
  });

  bot.on('error', (error: Error) => {
    console.error('Общая ошибка Telegram бота (при вебхуках):', error);
  });
}

Bun.serve<ClientData>({
  hostname: "0.0.0.0",
  port: port,
  websocket: {
    open(ws) {
      const id = Math.random().toString(36).slice(2, 10);
      clients.set(id, ws);
      ws.data.id = id;
      console.log(`[WS] Новый клиент: ${id}. Всего клиентов: ${clients.size}`);
      ws.send(JSON.stringify({ yourId: id }));
    },
    message(ws, message) {
      try {
        const data = JSON.parse(message.toString());

        if (data.type === "registerTelegramId" && typeof data.telegramUserId === 'number') {
          const existingWebRtcId = telegramToWebRtcIdMap.get(data.telegramUserId);
          if (existingWebRtcId && existingWebRtcId !== ws.data.id) {
            console.warn(`[WS] Telegram User ID ${data.telegramUserId} уже привязан к ${existingWebRtcId}. Перепривязываем к ${ws.data.id}.`);
          }
          telegramToWebRtcIdMap.set(data.telegramUserId, ws.data.id);
          ws.send(JSON.stringify({ type: "telegramIdRegistered", success: true }));
          console.log(`[WS] Привязан WebRTC ID ${ws.data.id} к Telegram User ID ${data.telegramUserId}.`);
          return;
        }

        const target = clients.get(data.to);
        if (target && target.readyState === 1) {
          target.send(JSON.stringify({ from: ws.data.id, ...data }));
        } else {
          console.warn(`[WS] Целевой клиент ${data.to} не найден или не готов.`);
          ws.send(JSON.stringify({ type: "error", message: `Peer ${data.to} not found or not ready.` }));
        }
      } catch (e) {
        console.error(`[WS] Ошибка в сообщении от ${ws.data.id}:`, e, `Сообщение: ${message}`);
      }
    },
    close(ws) {
      clients.delete(ws.data.id);
      console.log(`[WS] Клиент отключён: ${ws.data.id}. Всего клиентов: ${clients.size}`);
      for (const [tgUserId, webrtcId] of telegramToWebRtcIdMap.entries()) {
        if (webrtcId === ws.data.id) {
          telegramToWebRtcIdMap.delete(tgUserId);
          console.log(`[WS] Удален Telegram ID ${tgUserId} из маппинга при отключении WebRTC ID ${ws.data.id}.`);
          break;
        }
      }
    },
  },
  fetch: async (req, server) => {
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
      if (upgraded) {
        console.log(`[HTTP] Запрос на /ws успешно upgraded.`);
        return new Response();
      }
      console.warn(`[HTTP] Не удалось upgrade /ws запрос.`);
      return new Response("WebSocket upgrade failed", { status: 500 });
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

    // ЭНДПОИНТ ДЛЯ TELEGRAM WEBHOOK
    if (req.method === "POST" && url.pathname === TELEGRAM_WEBHOOK_PATH) {
      if (!bot) {
        console.warn('Получен Telegram webhook, но бот не инициализирован.');
        return new Response('Bot not initialized', { status: 500 });
      }
      try {
        const update = await req.json();
        bot.processUpdate(update as any);
        return new Response("OK", { status: 200 });
      } catch (e: unknown) {
        // Исправление 5: Безопасное извлечение сообщения об ошибке
        const errorMessage = e instanceof Error ? e.message : 'Неизвестная ошибка';
        console.error("Ошибка обработки Telegram webhook:", errorMessage);
        return new Response("Error processing update", { status: 500 });
      }
    }

    // ЭНДПОИНТ для Telegram бота (получение WebRTC ID)
    if (url.pathname === "/get-webrtc-id") {
      const telegramUserIdParam = url.searchParams.get("telegramUserId");
      if (telegramUserIdParam) {
        const telegramUserId = Number(telegramUserIdParam);
        if (isNaN(telegramUserId)) {
          return new Response(JSON.stringify({ error: "Invalid telegramUserId parameter." }), {
            status: 400,
            headers: { "Content-Type": "application/json" },
          });
        }

        const webrtcId = telegramToWebRtcIdMap.get(telegramUserId);
        if (webrtcId) {
          if (clients.has(webrtcId)) {
            console.log(`[HTTP] Telegram ID ${telegramUserId} -> WebRTC ID ${webrtcId} (активен).`);
            return new Response(JSON.stringify({ webrtcId: webrtcId }), {
              headers: { "Content-Type": "application/json" },
            });
          } else {
            telegramToWebRtcIdMap.delete(telegramUserId);
            console.warn(`[HTTP] Обнаружен неактивный WebRTC ID ${webrtcId} для Telegram ID ${telegramUserId}. Удалено из маппинга.`);
            return new Response(JSON.stringify({ error: "WebRTC ID is no longer active. Please refresh your browser and re-register." }), {
              status: 404,
              headers: { "Content-Type": "application/json" },
            });
          }
        } else {
          console.log(`[HTTP] WebRTC ID не найден для Telegram ID ${telegramUserId}.`);
          return new Response(JSON.stringify({ error: "WebRTC ID not found for this Telegram user. Please register first." }), {
            status: 404,
            headers: { "Content-Type": "application/json" },
          });
        }
      } else {
        console.warn(`[HTTP] Отсутствует параметр telegramUserId.`);
        return new Response(JSON.stringify({ error: "Missing telegramUserId parameter." }), {
          status: 400,
          headers: { "Content-Type": "application/json" },
        });
      }
    }

    console.log(`[HTTP] 404: ${url.pathname}`);
    return new Response("404 Not Found", { status: 404 });
  },
});

console.log(`Сервер запущен на http://0.0.0.0:${port}`);
console.log(`Режим разработки: ${isDev ? 'да' : 'нет'}`);