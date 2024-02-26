import WebSocket from 'ws';
import { getRandomUUID } from './utils';
import { AuthData, Message, RegistrationData, User } from './types';

export class BattleshipServer {
  private usersIds: number = 0;

  private wsServer!: WebSocket.Server;
  private isServerStarted: boolean = false;

  private readonly users: User[] = [];

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

      newSocket.on('message', (message): void => {
        this.processClientMessage(socket, message);
      });

      newSocket.on('close', () => {});
    });

    this.wsServer.on('close', () => {
      console.log('Server closed');
    });
  }

  private processClientMessage(
    client: WebSocket.WebSocket,
    message: WebSocket.RawData
  ): void {
    try {
      const messageRawParsed: Message = JSON.parse(message.toString());
      console.log('Message received:', messageRawParsed.type);

      switch (messageRawParsed.type) {
        case 'reg': {
          const data: AuthData = JSON.parse(messageRawParsed.data);
          this.processReg(data, client);
          break;
        }

        default: {
          console.warn('Received unknown request type');
          break;
        }
      }
    } catch (error) {
      console.error(error);
    }
  }

  private processReg(messageData: AuthData, socket: WebSocket.WebSocket): void {
    const sameLoginAndNotSamePass = this.users.find(
      (u) => u.name === messageData.name && u.password !== messageData.password
    );

    if (sameLoginAndNotSamePass) {
      this.sendNotValidPasswordResponse(socket);
      return;
    }

    let sameLoginAndPass = this.users.find(
      (u) => u.name + u.password === messageData.name + messageData.password
    );

    if (!sameLoginAndPass) {
      const newUser: User = {
        ...messageData,
        index: this.usersIds++,
        wins: 0,
      };

      this.users.push(newUser);
      sameLoginAndPass = newUser;
    } else {
      if (this.isUserAlreadyConnected(sameLoginAndPass.index)) {
        this.sendAlreadyConnectedResponse(socket);
        return;
      }
    }

    const user = sameLoginAndPass as User;

    const responseRegData: RegistrationData = {
      name: user.name,
      index: user.index,
      error: false,
      errorText: '',
    };

    const responseReg: Message = {
      type: 'reg',
      data: JSON.stringify(responseRegData),
      id: 0,
    };

    console.log('Message has sent - reg request');
    const newSocket: WebSocket.WebSocket & { userIndex: number } =
      Object.assign(socket, { userIndex: user.index });
    newSocket.send(JSON.stringify(responseReg));
  }

  private isUserAlreadyConnected(userId: number): boolean {
    return [...this.wsServer.clients.values()].some((socket) => {
      if (
        socket.readyState === WebSocket.OPEN &&
        (socket as WebSocket.WebSocket & { userIndex: number }).userIndex ===
          userId
      ) {
        return true;
      }
    });
  }

  private sendAlreadyConnectedResponse(socket: WebSocket.WebSocket): void {
    const responseRegData = {
      error: true,
      errorText: 'You already connected session',
    };
    const responseReg: Message = {
      type: 'reg',
      data: JSON.stringify(responseRegData),
      id: 0,
    };
    console.log('Message sent - sending user already connected from session');
    socket.send(JSON.stringify(responseReg));
  }

  private sendNotValidPasswordResponse(socket: WebSocket.WebSocket) {
    const responseRegData = {
      error: true,
      errorText:
        'User with this login already exists, but password is incorrect!',
    };
    const responseReg: Message = {
      type: 'reg',
      data: JSON.stringify(responseRegData),
      id: 0,
    };
    console.log('Message sent - sending invalid password info');
    socket.send(JSON.stringify(responseReg));
  }
}
