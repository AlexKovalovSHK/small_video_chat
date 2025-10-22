import { WebSocketGateway, SubscribeMessage, WebSocketServer, ConnectedSocket, MessageBody } from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';

@WebSocketGateway({ cors: true }) // разрешаем CORS для фронтенда
export class SignalingGateway {
  @WebSocketServer()
  server: Server;

  // простой in-memory список подключений
  private clients = new Map<string, Socket>();

  @SubscribeMessage('join')
handleJoin(@MessageBody() room: string, @ConnectedSocket() client: Socket) {
  client.join(room);
  this.clients.set(client.id, client);

  // Получаем всех клиентов в комнате
  const clientsInRoom = Array.from(this.server.sockets.adapter.rooms.get(room) || []);

  // Отправляем клиенту список подключений
  client.emit('joined', clientsInRoom);

  console.log(`${client.id} joined room ${room}, clients: ${clientsInRoom.length}`);
}


  @SubscribeMessage('signal')
  handleSignal(@MessageBody() data: any, @ConnectedSocket() client: Socket) {
    const { room, signal } = data;
    // пересылаем сигнал всем кроме отправителя
    client.to(room).emit('signal', { sender: client.id, signal });
  }

  handleDisconnect(client: Socket) {
    this.clients.delete(client.id);
    console.log(`${client.id} disconnected`);
  }



}
