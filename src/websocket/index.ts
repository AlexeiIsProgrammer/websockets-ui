import WebSocket from 'ws';
import { getRandomUUID } from './utils';

export class BattleshipServer {
  private wsServer!: WebSocket.Server;
  private isServerStarted: boolean = false;

  constructor(private port: number) {}

  startServer(): void {
    if (this.isServerStarted) {
      console.log(`Server is running on port ${this.port}`);
      return;
    }

    this.wsServer = new WebSocket.Server({ port: this.port }, () =>
      console.log(`Server has started on port ${this.port}`)
    );

    this.isServerStarted = true;

    this.wsServer.on('connection', (socket: WebSocket.WebSocket): void => {
      const id = getRandomUUID();

      const newSocket: WebSocket.WebSocket & { id: string } = Object.assign(
        socket,
        { id }
      );

      newSocket.on('connection', () => {
        console.log(`New socket has connected, id is: ${id}`);
      });
    });

    this.wsServer.on('close', () => {
      console.log('Server closed');
    });
  }
}
