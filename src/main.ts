import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { IoAdapter } from '@nestjs/platform-socket.io'; // Используем адаптер для Socket.IO

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Включаем CORS для HTTP-сервера
  app.enableCors({
    origin: '*', // Разрешить запросы с любых источников
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
    credentials: true,
  });

  // Используем IoAdapter для интеграции Socket.IO
  app.useWebSocketAdapter(new IoAdapter(app));

  const port = Number(process.env.PORT) || 3010;
  await app.listen(port, () => {
    console.log(`✅ Сервер запущен: http://localhost:${port}`);
    console.log(`Режим разработки: ${process.env.NODE_ENV === "dev" ? "да" : "нет"}`);
  });
}
bootstrap();