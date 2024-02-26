import WebSocket from 'ws';
import { getRandomNumber, getRandomUUID } from './utils';
import {
  AddShipsData,
  AddToRoomData,
  AttackData,
  AttackRequestData,
  AttackResult,
  AuthData,
  CreateGameData,
  FinishGameData,
  Game,
  Message,
  PlayerInGame,
  Position,
  RandomRequestData,
  RegistrationData,
  Room,
  Ship,
  StartGameData,
  User,
} from './types';

export class BattleshipServer {
  private boardSize = 10;

  private botWs = {
    userIndex: -1,
    send: () => {},
  } as unknown as WebSocket.WebSocket & { userIndex: number };

  private bot = {
    index: -1,
    name: 'Bot',
    password: 'Bot',
    wins: -1,
  };

  private usersIds: number = 0;
  private roomsIds: number = 0;
  private gamesIds: number = 0;

  private wsServer!: WebSocket.Server;
  private isServerStarted: boolean = false;

  private readonly users: User[] = [this.bot];
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
        this.processSocketMessage(socket, message);
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

  private processSocketMessage(
    socket: WebSocket.WebSocket,
    message: WebSocket.RawData
  ): void {
    try {
      const messageRawParsed: Message = JSON.parse(message.toString());
      console.log('Message received:', messageRawParsed.type);

      switch (messageRawParsed.type) {
        case 'reg': {
          const data: AuthData = JSON.parse(messageRawParsed.data);
          this.processReg(data, socket);
          break;
        }
        case 'create_room': {
          this.createRoom(
            socket as WebSocket.WebSocket & { userIndex: number }
          );
          this.sendFreeRooms();
          break;
        }
        case 'add_user_to_room': {
          const data: AddToRoomData = JSON.parse(messageRawParsed.data);
          const roomIndex = this.addToRoom(
            socket as WebSocket.WebSocket & { userIndex: number },
            data
          );
          this.sendFreeRooms();
          this.createGame(roomIndex);

          break;
        }

        case 'add_ships': {
          const data: AddShipsData = JSON.parse(messageRawParsed.data);
          const gameIndex = this.addShips(data);
          if (
            this.games[gameIndex].players.every((p) => p.ships.length !== 0)
          ) {
            console.log('Start the game');
            this.startGame(gameIndex);
            this.switchTurn(gameIndex);
          }
          break;
        }
        case 'attack': {
          const data: AttackRequestData = JSON.parse(messageRawParsed.data);
          this.attack(data);
          break;
        }
        case 'randomAttack': {
          const data: RandomRequestData = JSON.parse(messageRawParsed.data);
          const randomPosition = this.generateRandomAttackPosition(data);
          const fullAttackData: AttackRequestData = {
            ...randomPosition,
            ...data,
          };
          this.attack(fullAttackData);
          break;
        }
        case 'single_play':
          this.gameWithBot(
            socket as WebSocket.WebSocket & { userIndex: number },
            messageRawParsed
          );
          break;
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
      let socket;
      if (player === -1) {
        socket = this.botWs;
      } else {
        socket = this.findSocket(player);
        if (!socket) {
          throw Error('createGame: socket not found');
        }
      }

      const data: CreateGameData = { idGame: id, idPlayer: player };
      const message: Message = {
        type: 'create_game',
        id: 0,
        data: JSON.stringify(data),
      };
      socket.send(JSON.stringify(message));
    });
  }

  private findSocket(index: number): WebSocket.WebSocket | undefined {
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

  private finishGame(gameIndex: number, draw = false): void {
    const game = this.games[gameIndex];

    if (game?.isFinished) {
      return;
    }

    const winner = !draw ? game.turn : -1;

    const finishMessage: FinishGameData = { winPlayer: winner };
    const response: Message = {
      type: 'finish',
      data: JSON.stringify(finishMessage),
      id: 0,
    };
    const responseString = JSON.stringify(response);

    game.isFinished = true;

    console.log('Message sent: finishing game');

    game.players.forEach((player) => {
      const socket = this.findSocket(player.index);
      if (!socket) {
        return;
      }

      socket.send(responseString);
    });
  }

  private addWinToUser(userId: number): void {
    const user = this.users.find((user) => user.index === userId);

    if (!user) {
      throw Error(`addWinToUser: user ${userId} does not exist`);
    }

    ++user.wins;
  }

  private generateRandomAttackPosition(data: RandomRequestData): Position {
    const game = this.games.find((game) => game.id === data.gameId);

    if (!game) {
      throw Error('generateRandomAttackPosition: game not found by id');
    }

    const player = game.players.find(
      (player) => player.index === data.indexPlayer
    );

    if (!player) {
      throw Error('generateRandomAttackPosition: player not found by id');
    }

    const wasPositionAlreadyUsed = (position: Position): boolean => {
      return player.attacks.some(
        (attack) => attack.x === position.x && attack.y === position.y
      );
    };

    const maxCoordinate = this.boardSize - 1;
    const minCoordinate = 0;

    let x: number = getRandomNumber(minCoordinate, maxCoordinate);
    let y: number = getRandomNumber(minCoordinate, maxCoordinate);

    while (wasPositionAlreadyUsed({ x, y })) {
      x = getRandomNumber(minCoordinate, maxCoordinate);
      y = getRandomNumber(minCoordinate, maxCoordinate);
    }

    return { x, y };
  }

  private addShips(data: AddShipsData): number {
    const gameIndex = this.games.findIndex((game) => game.id === data.gameId);

    if (gameIndex < 0) {
      throw Error(`Game with id ${data.gameId} not found`);
    }

    const playerIndex = this.games[gameIndex].players.findIndex(
      (p) => p.index === data.indexPlayer
    );

    if (playerIndex < 0) {
      throw Error(`addShips: Player with id ${data.indexPlayer} not found`);
    }

    this.games[gameIndex].players[playerIndex].ships.push(
      ...data.ships.map((ship) => ({
        ...ship,
        aliveCells: new Array(ship.length).fill(true),
      }))
    );

    return gameIndex;
  }

  private startGame(gameIndex: number): void {
    console.log('Message sent: starting game');

    this.games[gameIndex].players.forEach((player) => {
      const socket = this.findSocket(player.index);
      if (!socket) {
        throw Error('startGame: WS Socket not found');
      }

      const data: StartGameData = {
        currentPlayerIndex: player.index,
        ships: player.ships,
      };

      const message: Message = {
        id: 0,
        type: 'start_game',
        data: JSON.stringify(data),
      };

      socket.send(JSON.stringify(message));
    });
  }

  private attack(data: AttackRequestData): void {
    const attackResult = this.shootAtShip(data);
    if (attackResult) {
      if (attackResult.status === 'killed' && attackResult.damagedShip) {
        this.setMissStateAfterShipKill(
          attackResult.gameIndex,
          attackResult.damagedShip
        );

        if (this.didCurrentPlayerWin(attackResult.gameIndex)) {
          this.addWinToUser(this.games[attackResult.gameIndex].turn);
          this.finishGame(attackResult.gameIndex);
          this.updateWinners();
        }
        return;
      }

      this.switchTurn(attackResult.gameIndex, attackResult.status !== 'miss');
    }
  }

  private shootAtShip(data: AttackRequestData): null | AttackResult {
    const gameIndex = this.gameIndexById(data.gameId);

    if (gameIndex < 0) {
      throw Error('attack: game not found');
    }

    if (data.indexPlayer !== this.games[gameIndex].turn) {
      return null;
    }

    const game = this.games[gameIndex];

    const enemyIndex: 0 | 1 =
      game.players[0].index === data.indexPlayer ? 1 : 0;
    const selfIndex: 0 | 1 = game.players[0].index === data.indexPlayer ? 0 : 1;

    if (
      game.players[selfIndex].attacks.find(
        (a) => a.y === data.y && a.x === data.x
      )
    ) {
      return null;
    }

    const attackStatus = this.detectAttackStatus(
      game.players[enemyIndex],
      data.x,
      data.y
    );

    const attackResponseData: AttackData = {
      position: { x: data.x, y: data.y },
      status: attackStatus.status,
      currentPlayer: data.indexPlayer,
    };

    const response: Message = {
      type: 'attack',
      id: 0,
      data: JSON.stringify(attackResponseData),
    };
    const responseString = JSON.stringify(response);

    console.log('Message sent: attack');
    game.players.forEach((player) => {
      const client = this.findSocket(player.index);

      if (!client) {
        throw Error('createGame: client not found');
      }

      client.send(responseString);
    });

    this.games[gameIndex].players[selfIndex].attacks.push({
      x: data.x,
      y: data.y,
    });

    return {
      gameIndex: gameIndex,
      status: attackStatus.status,
      damagedShip: attackStatus.damagedShip,
    };
  }

  private detectAttackStatus(
    playerInGame: PlayerInGame,
    attackX: number,
    attackY: number
  ): Omit<AttackResult, 'gameIndex'> {
    for (const ship of playerInGame.ships) {
      if (!(ship.position.x === attackX || ship.position.y === attackY)) {
        continue;
      }

      if (ship.direction && ship.position.x === attackX) {
        for (let y = ship.position.y; y < ship.position.y + ship.length; ++y) {
          if (y === attackY) {
            ship.aliveCells[y - ship.position.y] = false;

            if (ship.aliveCells.every((cell) => !cell)) {
              return { status: 'killed', damagedShip: ship };
            } else {
              return { status: 'shot', damagedShip: ship };
            }
          }
        }
      } else if (!ship.direction && ship.position.y === attackY) {
        for (let x = ship.position.x; x < ship.position.x + ship.length; ++x) {
          if (x === attackX) {
            ship.aliveCells[x - ship.position.x] = false;

            if (ship.aliveCells.every((cell) => !cell)) {
              return { status: 'killed', damagedShip: ship };
            } else {
              return { status: 'shot', damagedShip: ship };
            }
          }
        }
      }
    }

    return { status: 'miss' };
  }

  private setMissStateAfterShipKill(
    gameIndex: number,
    damagedShip: Ship
  ): void {
    const game = this.games[gameIndex];
    const currentTurn = game.turn;
    const playerIndexInGameArray = game.players.findIndex(
      (player) => player.index === currentTurn
    );

    if (playerIndexInGameArray < 0) {
      throw new Error(
        'setMissStateAfterShipKill: can not find player by his turn'
      );
    }

    const self = game.players[playerIndexInGameArray].index;

    const positions = this.generateMissesAroundKilledShip(damagedShip);
    game.players[playerIndexInGameArray].attacks.push(...positions);

    console.log('Message sent: setting missed state after killed ship');

    game.players.forEach((player) => {
      const client = this.findSocket(player.index);

      if (!client) {
        throw Error('createGame: client not found');
      }

      positions.forEach((position) => {
        const attackResponseData: AttackData = {
          position: { x: position.x, y: position.y },
          status: 'miss',
          currentPlayer: self,
        };

        const message: Message = {
          type: 'attack',
          id: 0,
          data: JSON.stringify(attackResponseData),
        };

        client.send(JSON.stringify(message));
      });
    });
  }

  private generateMissesAroundKilledShip(ship: Ship): Position[] {
    const positions: Position[] = [];
    const isValidPosition = (position: Position) => {
      return (
        position.x >= 0 &&
        position.x < this.boardSize &&
        position.y >= 0 &&
        position.y < this.boardSize
      );
    };
    let shipX;
    let shipY;
    if (ship.direction) {
      shipY = ship.position.y;
      shipX = ship.position.x;
      for (let x = shipX - 1; x <= shipX + 1; ++x) {
        if (isValidPosition({ x, y: shipY - 1 })) {
          positions.push({ x, y: shipY - 1 });
        }
      }
      for (let y = shipY; y < shipY + ship.length; ++y) {
        if (isValidPosition({ y, x: shipX - 1 })) {
          positions.push({ y, x: shipX - 1 });
        }

        if (isValidPosition({ y, x: shipX + 1 })) {
          positions.push({ y, x: shipX + 1 });
        }
      }
      for (let x = shipX - 1; x <= shipX + 1; ++x) {
        if (isValidPosition({ x, y: shipY + ship.length })) {
          positions.push({ x, y: shipY + ship.length });
        }
      }
    } else if (!ship.direction) {
      shipY = ship.position.y;
      shipY = ship.position.y;
      shipX = ship.position.x;
      for (let y = shipY - 1; y <= shipY + 1; ++y) {
        if (isValidPosition({ y, x: shipX - 1 })) {
          positions.push({ y, x: shipX - 1 });
        }
      }
      for (let x = shipX; x < shipX + ship.length; ++x) {
        if (isValidPosition({ x, y: shipY - 1 })) {
          positions.push({ x, y: shipY - 1 });
        }

        if (isValidPosition({ x, y: shipY + 1 })) {
          positions.push({ x, y: shipY + 1 });
        }
      }
      for (let y = shipY - 1; y <= shipY + 1; ++y) {
        if (isValidPosition({ y, x: shipX + ship.length })) {
          positions.push({ y, x: shipX + ship.length });
        }
      }
    }

    return positions;
  }

  private gameIndexById(id: number) {
    return this.games.findIndex((game) => game.id === id);
  }

  private switchTurn(gameIndex: number, skipSwitching: boolean = false): void {
    if (gameIndex < 0) {
      return;
    }
    const game = this.games[gameIndex];

    const currentTurn = game.turn;

    if (!skipSwitching) {
      if (currentTurn === game.players[0].index) {
        game.turn = game.players[1].index;
      } else if (currentTurn === game.players[1].index) {
        game.turn = game.players[0].index;
      }
    }

    const newTurn = this.games[gameIndex].turn;

    const responseData: { currentPlayer: number } = { currentPlayer: newTurn };
    const response: Message = {
      type: 'turn',
      id: 0,
      data: JSON.stringify(responseData),
    };
    const responseString = JSON.stringify(response);

    console.log('Message sent: switching turn');

    game.players.forEach((player) => {
      const socket = this.findSocket(player.index);

      if (!socket) {
        throw Error('createGame: client not found');
      }

      socket.send(responseString);
    });
  }

  private gameWithBot = (
    ws: WebSocket.WebSocket & { userIndex: number },
    request: Message
  ) => {
    switch (request.type) {
      case 'single_play': {
        console.log('The user_s bot game has begun');
        this.startSingleGame(ws);
        break;
      }
      case 'add_ships': {
        const data: AddShipsData = JSON.parse(request.data);
        this.startAttack(data);
        break;
      }
      case 'attack': {
        const data: AttackRequestData = JSON.parse(request.data);
        this.attack(data);
        break;
      }
      case 'randomAttack': {
        const data: RandomRequestData = JSON.parse(request.data);
        const randomPosition = this.generateRandomAttackPosition(data);
        const fullAttackData: AttackRequestData = {
          ...randomPosition,
          ...data,
        };
        this.attack(fullAttackData);
        break;
      }
    }
  };

  private startSingleGame = (
    ws: WebSocket.WebSocket & { userIndex: number }
  ) => {
    this.createRoom(ws);
    console.log(this.rooms);
    console.log(this.roomsIds);

    const ind = this.addToRoom(this.botWs, { indexRoom: this.roomsIds - 1 });
    this.createGame(ind);
  };

  private startAttack = (data: AddShipsData) => {
    const botField = this.generateRandomAttackPosition(data);
    const game = this.games.find((game) => game.id === data.gameId);
    game?.players[0].index === -1
      ? game?.players[0].attacks.push(botField)
      : game?.players[1].attacks.push(botField);

    this.startGame(data.gameId);
  };
}
