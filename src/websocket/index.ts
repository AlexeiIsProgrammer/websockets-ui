import WebSocket from 'ws';
import { getRandomUUID } from './utils';
import {
  AddToRoomData,
  AuthData,
  CreateGameData,
  FinishGameData,
  Game,
  Message,
  RegistrationData,
  Room,
  User,
} from './types';

export class BattleshipServer {
  private usersIds: number = 0;
  private roomsIds: number = 0;
  private gamesIds: number = 0;

  private wsServer!: WebSocket.Server;
  private isServerStarted: boolean = false;

  private readonly users: User[] = [];
  private readonly rooms: Room[] = [];
  private readonly games: Game[] = [];

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

      newSocket.on('close', () => {
        this.removeUser(socket);
      });
    });

    this.wsServer.on('close', () => {
      console.log('Server closed');
      this.clearServer();
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
        case 'create_room': {
          this.createRoom(
            client as WebSocket.WebSocket & { userIndex: number }
          );
          this.sendFreeRooms();
          break;
        }
        case 'add_user_to_room': {
          const data: AddToRoomData = JSON.parse(messageRawParsed.data);
          const roomIndex = this.addToRoom(
            client as WebSocket.WebSocket & { userIndex: number },
            data
          );
          this.sendFreeRooms();
          this.createGame(roomIndex);

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

  private updateWinners(): void {
    if (!this.wsServer) {
      return;
    }

    const responseUpdateData = [...this.users.values()].map(
      ({ name, wins }) => ({
        name,
        wins,
      })
    );

    const response: Message = {
      type: 'update_winners',
      data: JSON.stringify(responseUpdateData),
      id: 0,
    };
    const responseString = JSON.stringify(response);

    console.log('Message sent: updating winners');
    this.wsServer.clients.forEach((socket) => socket.send(responseString));
  }

  private createRoom(
    socket: WebSocket.WebSocket & { userIndex: number }
  ): void {
    const currentUser = this.users.find((u) => u.index === socket.userIndex);

    if (!currentUser) {
      return;
    }

    const newRoom: Room = {
      roomUsers: [{ name: currentUser.name, index: currentUser.index }],
      roomId: this.roomsIds++,
    };

    this.rooms.push(newRoom);
  }

  private addToRoom(
    socket: WebSocket.WebSocket & { userIndex: number },
    data: AddToRoomData
  ): number {
    const { indexRoom } = data;

    const index = this.rooms.findIndex((r) => r.roomId === indexRoom);

    if (index < 0) {
      throw Error('addToRoom: index not found');
    }

    const { userIndex } = socket;

    if (userIndex === undefined) {
      throw Error('NOT FOUND');
    }

    const currentUser = this.users.find((u) => u.index === socket.userIndex);

    if (!currentUser) {
      throw Error('addToRoom: current user NOT FOUND');
    }

    if (this.rooms[index].roomUsers[0].index === currentUser.index) {
      return index;
    }

    this.rooms[index].roomUsers.push({
      name: currentUser.name,
      index: currentUser.index,
    });

    return index;
  }

  private sendFreeRooms(): void {
    const free = this.rooms.filter((r) => r.roomUsers.length === 1);
    const response: Message = {
      type: 'update_room',
      data: JSON.stringify(free),
      id: 0,
    };

    console.log('Message sent: sending free rooms');

    this.wsServer.clients.forEach((socket) => {
      socket.send(JSON.stringify(response));
    });
  }

  private createGame(roomIndex: number) {
    const room = this.rooms[roomIndex];
    if (room.roomUsers.length !== 2) {
      return;
    }

    const id = this.gamesIds++;
    const player1 = room.roomUsers[0].index;
    const player2 = room.roomUsers[1].index;

    console.log(
      `creating game ${roomIndex}; With players: ${player1} (creator) and ${player2} (added himself (herself))`
    );

    this.games.push({
      id,
      players: [
        {
          index: player1,
          ships: [],
          attacks: [],
        },
        {
          index: player2,
          ships: [],
          attacks: [],
        },
      ],
      turn: player1,
      isFinished: false,
    });

    [player1, player2].forEach((player) => {
      const client = this.findClient(player);
      if (!client) {
        throw Error('createGame: client not found');
      }

      const data: CreateGameData = { idGame: id, idPlayer: player };
      const message: Message = {
        type: 'create_game',
        id: 0,
        data: JSON.stringify(data),
      };
      client.send(JSON.stringify(message));
    });
  }

  private findClient(index: number): WebSocket.WebSocket | undefined {
    return [...this.wsServer.clients.values()].find(
      (ws) =>
        (ws as WebSocket.WebSocket & { userIndex: number }).userIndex === index
    );
  }

  private removeUser(socket: WebSocket.WebSocket): void {
    const userIndex = (socket as WebSocket.WebSocket & { userIndex: number })
      .userIndex;

    let index: number;

    do {
      index = this.rooms.findIndex((room) =>
        room.roomUsers.find((user) => user.index === userIndex)
      );
      if (index >= 0) {
        this.rooms.splice(index, 1);
      }
    } while (index >= 0);

    do {
      index = this.games.findIndex((game) =>
        game.players.find((user) => user.index === userIndex)
      );
      if (index >= 0) {
        this.games.splice(index, 1);
      }
    } while (index >= 0);

    this.updateWinners();
    this.sendFreeRooms();
  }

  private clearServer(): void {
    this.rooms.length = 0;
    this.users.length = 0;
    this.games.length = 0;
    this.isServerStarted = false;
  }

  private didCurrentPlayerWin(gameIndex: number): boolean {
    const game = this.games[gameIndex];
    const currentPlayerIndexInArray = game.players.findIndex(
      (player) => player.index === game.turn
    );
    const enemyIndexInArray = (currentPlayerIndexInArray + 1) % 2;

    if (currentPlayerIndexInArray < 0) {
      throw Error('didCurrentPlayerWin: current player not found');
    }

    return game.players[enemyIndexInArray].ships.every((ship) => {
      return ship.aliveCells.every((cell) => !cell);
    });
  }
}
