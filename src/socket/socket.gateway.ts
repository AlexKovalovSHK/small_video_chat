import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
  WsResponse,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger } from '@nestjs/common';

// Интерфейс для сообщения, которое клиенты будут отправлять
interface MessagePayload {
  to: string;
  type: string;
  sdp?: RTCSessionDescriptionInit; // Changed to RTCSessionDescriptionInit for better type safety
  candidate?: RTCIceCandidate;
  from?: string; // Add 'from' to the payload for messages coming from other clients
}

@WebSocketGateway({
  cors: {
    origin: '*', // Разрешаем CORS для Socket.IO
    methods: ['GET', 'POST'],
  },
})
export class SocketGateway {
  @WebSocketServer() server: Server;
  private logger: Logger = new Logger('SocketGateway');

  afterInit(server: Server) {
    this.logger.log('Socket.IO Gateway инициализирован');
  }

  handleConnection(client: Socket, ...args: any[]) {
    this.logger.log(`[Socket.IO] Подключен клиент: ${client.id}`);
    client.emit('yourId', client.id); // Отправляем клиенту его ID
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`[Socket.IO] Клиент ${client.id} отключён`);
  }

  @SubscribeMessage('message')
  handleMessage(@MessageBody() data: MessagePayload, @ConnectedSocket() client: Socket): void {
    const targetSocket = this.server.sockets.sockets.get(data.to);

    if (targetSocket) {
      // Пересылаем сообщение целевому клиенту, добавляя ID отправителя
      targetSocket.emit('message', { from: client.id, ...data });
      this.logger.log(`Сообщение от ${client.id} для ${data.to} (Тип: ${data.type})`);
    } else {
      // Если целевой клиент не найден
      client.emit('error', { message: `Пользователь ${data.to} не найден` });
      this.logger.warn(`Попытка отправить сообщение несуществующему пользователю: ${data.to} от ${client.id}`);
    }
  }

  // Можно добавить дополнительные обработчики, если нужно
  // @SubscribeMessage('testEvent')
  // handleTestEvent(@MessageBody() data: string, @ConnectedSocket() client: Socket): WsResponse<string> {
  //   this.logger.log(`Test event from ${client.id}: ${data}`);
  //   return { event: 'testEventResponse', data: `Hello from server, ${data}!` };
  // }
}