// telegram_bot.ts
import TelegramBot, { type Message } from "node-telegram-bot-api";

// Загрузка .env файла для бота
if (!process.env.NODE_ENV || process.env.NODE_ENV === "development") {
  try {
    const dotenvFile = Bun.file(".env");
    if (await dotenvFile.exists()) {
      const text = await dotenvFile.text();
      for (const line of text.split("\n")) {
        const [key, ...value] = line.trim().split("=");
        if (key && !key.startsWith("#") && value !== undefined) {
          const val = value.join("=");
          process.env[key] = val;
          Bun.env[key] = val; // Для Bun.env, если используется
        }
      }
    }
  } catch (e) {
    console.warn("Ошибка при загрузке .env файла для бота:", e);
  }
}

const TELEGRAM_BOT_TOKEN = Bun.env.TG_BOT || "YOUR_TELEGRAM_BOT_TOKEN";
const WEBRTC_SERVER_URL = Bun.env.WEBRTC_SERVER_URL || "http://localhost:3010";

if (TELEGRAM_BOT_TOKEN === "YOUR_TELEGRAM_BOT_TOKEN" || !TELEGRAM_BOT_TOKEN) {
  console.error(
    "Ошибка: Токен Telegram бота не установлен. Укажите его в .env файле как TG_BOT=..."
  );
  process.exit(1);
}

const bot = new TelegramBot(TELEGRAM_BOT_TOKEN, { polling: true });

console.log("Telegram бот запущен!");

// Определим интерфейсы для ожидаемых данных
interface WebRtcIdResponse {
  webrtcId?: string; // Может быть undefined, если не найден
  error?: string;
}

// Определим тип для ошибки, которую возвращает TelegramBot (PollingError)
// Если error.code не является частью стандартного Error, нужно его добавить
interface PollingError extends Error {
  code?: string; // TelegramBot API часто возвращает code
  response?: any; // Может содержать дополнительные детали от API
}

bot.onText(/\/start/, (msg: Message) => {
  // Указываем тип msg как Message
  const chatId = msg.chat.id;
  bot.sendMessage(
    chatId,
    "Привет! Я бот для видеозвонков. Отправь мне /getlink, чтобы получить ссылку на звонок."
  );
});

bot.onText(/\/getlink/, async (msg: Message) => {
  // Указываем тип msg как Message
  const chatId = msg.chat.id;
  const telegramUserId = msg.from?.id;

  if (!telegramUserId) {
    bot.sendMessage(
      chatId,
      "Не могу получить ваш Telegram User ID. Пожалуйста, попробуйте еще раз."
    );
    return;
  }

  try {
    const response = await fetch(
      `${WEBRTC_SERVER_URL}/get-webrtc-id?telegramUserId=${telegramUserId}`
    );

    if (response.ok) {
      // Приводим data к нашему интерфейсу
      const data: WebRtcIdResponse = (await response.json()) || "";
      if (data.webrtcId) {
        const inviteLink = `${WEBRTC_SERVER_URL}/?join=${data.webrtcId}`;
        bot.sendMessage(
          chatId,
          `Ваша ссылка-приглашение для видеозвонка:\n\`${inviteLink}\`\n\n` +
            `Чтобы получить свой ID в браузере, сначала зайдите на страницу ${WEBRTC_SERVER_URL} и нажмите "Привязать Telegram ID" (используя ваш Telegram User ID: \`${telegramUserId}\`).`,
          { parse_mode: "Markdown" }
        );
      } else {
        bot.sendMessage(
          chatId,
          `Не удалось получить активный WebRTC ID. ${data.error || ""}\n` +
            `Пожалуйста, сначала откройте страницу ${WEBRTC_SERVER_URL}, разрешите доступ к камере/микрофону и нажмите "Привязать Telegram ID", используя ваш Telegram User ID: \`${telegramUserId}\`.`,
          { parse_mode: "Markdown" }
        );
      }
    } else {
      // Приводим errorData к нашему интерфейсу
      const errorData: WebRtcIdResponse = (await response.json()) || "";
      console.error("Ошибка при запросе WebRTC ID:", errorData);
      bot.sendMessage(
        chatId,
        `Произошла ошибка при получении вашего ID: \`${
          errorData.error || response.statusText
        }\`\n` +
          `Убедитесь, что вы открыли страницу ${WEBRTC_SERVER_URL} и привязали свой Telegram ID.`,
        { parse_mode: "Markdown" }
      );
    }
  } catch (error) {
    // Здесь error может быть любого типа, лучше его проверить
    // Проверяем, является ли error экземпляром Error
    if (error instanceof Error) {
      console.error(
        "Ошибка сети или сервера при запросе WebRTC ID:",
        error.message
      );
      bot.sendMessage(
        chatId,
        `Произошла ошибка при подключении к WebRTC сервису: \`${error.message}\``,
        { parse_mode: "Markdown" }
      );
    } else {
      // Если это не Error (например, строка или другой тип)
      console.error(
        "Неизвестная ошибка сети или сервера при запросе WebRTC ID:",
        error
      );
      bot.sendMessage(
        chatId,
        `Произошла неизвестная ошибка при подключении к WebRTC сервису.`,
        { parse_mode: "Markdown" }
      );
    }
  }
});

bot.onText(/\/mytelegramid/, (msg: Message) => {
  // Указываем тип msg как Message
  const chatId = msg.chat.id;
  const telegramUserId = msg.from?.id;
  if (telegramUserId) {
    bot.sendMessage(chatId, `Ваш Telegram User ID: \`${telegramUserId}\``, {
      parse_mode: "Markdown",
    });
  } else {
    bot.sendMessage(chatId, "Не могу получить ваш Telegram User ID.");
  }
});

bot.on("message", (msg: Message) => {
  // Указываем тип msg как Message
  if (msg.text && !msg.text.startsWith("/")) {
    const chatId = msg.chat.id;
    bot.sendMessage(
      chatId,
      "Я понимаю только команды. Попробуйте /start или /getlink."
    );
  }
});

// Добавляем обработку ошибок polling
bot.on("polling_error", (error: PollingError) => {
  // Приводим error к нашему PollingError
  // Теперь TypeScript знает о 'code'
  console.error(
    `Ошибка Polling: ${error.code || "UNKNOWN_CODE"} - ${error.message}`
  );
});
