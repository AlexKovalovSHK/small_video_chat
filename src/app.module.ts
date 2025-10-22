import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { SocketModule } from './socket/socket.module';

@Module({
  imports: [SocketModule], // Добавляем SocketModule в импорты
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}