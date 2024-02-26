"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.GameServer = void 0;
const ws_1 = __importDefault(require("ws"));
const utils_1 = require("./utils");
const constants_1 = require("./constants");
class GameServer {
    port;
    usersIdCounter = 0;
    roomsIdCounter = 0;
    gamesIdCounter = 0;
    users = [];
    rooms = [];
    games = [];
    webSocketServer;
    isStarted = false;
    constructor(port) {
        this.port = port;
    }
    runServer() {
        if (this.isStarted) {
            console.warn(`Server already running on port ${this.port}`);
            return;
        }
        this.webSocketServer = new ws_1.default.Server({ port: this.port }, () => console.log(`WebSockets server has just been started on port ${this.port}`));
        this.isStarted = true;
        this.rooms.length = 0;
        this.users.length = 0;
        this.games.length = 0;
        this.webSocketServer.on('connection', (client) => {
            const id = (0, utils_1.uuidv4)();
            client.id = id;
            client.on('connection', () => {
                console.log(`New client connected. Gave him ID: ${id}`);
            });
            client.on('message', (message) => {
                this.processClientMessage(client, message);
            });
            client.on('close', () => {
                this.removeUserAndItsData(client);
            });
        });
        this.webSocketServer.on('close', () => {
            console.log('WS Server closed');
            this.clearServer();
        });
    }
    processClientMessage(client, message) {
        try {
            const messageRawParsed = JSON.parse(message.toString());
            switch (messageRawParsed.type) {
                case 'reg': {
                    const data = JSON.parse(messageRawParsed.data);
                    this.processReg(data, client);
                    this.sendFreeRooms();
                    this.updateWinners();
                    break;
                }
                case 'create_room': {
                    this.createRoom(client);
                    this.sendFreeRooms();
                    break;
                }
                case 'add_user_to_room': {
                    const data = JSON.parse(messageRawParsed.data);
                    const roomIndex = this.addToRoom(client, data);
                    this.sendFreeRooms();
                    this.createGame(roomIndex);
                    break;
                }
                case 'add_ships': {
                    const data = JSON.parse(messageRawParsed.data);
                    const gameIndex = this.addShips(data);
                    if (this.games[gameIndex].players.every((p) => p.ships.length !== 0)) {
                        console.log('STARTING GAME');
                        this.startGame(gameIndex);
                        this.switchTurn(gameIndex);
                    }
                    break;
                }
                case 'attack': {
                    const data = JSON.parse(messageRawParsed.data);
                    this.attack(data);
                    break;
                }
                case 'randomAttack': {
                    const data = JSON.parse(messageRawParsed.data);
                    const randomPosition = this.generateRandomAttackPosition(data);
                    const fullAttackData = {
                        ...randomPosition,
                        ...data,
                    };
                    this.attack(fullAttackData);
                    break;
                }
                default: {
                    console.warn('Received unknown request type');
                    break;
                }
            }
        }
        catch (error) {
            console.error(error);
        }
    }
    static getUserPk(name, password) {
        return name + password;
    }
    processReg(messageData, client) {
        const userPk = GameServer.getUserPk(messageData.name, messageData.password);
        const sameLoginAndNotSamePass = this.users.find((u) => u.name === messageData.name && u.password !== messageData.password);
        if (sameLoginAndNotSamePass) {
            this.sendNotValidPasswordResponse(client);
            return;
        }
        let sameLoginAndPass = this.users.find((u) => GameServer.getUserPk(u.name, u.password) === userPk);
        if (!sameLoginAndPass) {
            const newUser = {
                ...messageData,
                index: this.usersIdCounter++,
                wins: 0,
            };
            this.users.push(newUser);
            sameLoginAndPass = newUser;
        }
        else {
            if (this.isUserAlreadyConnected(sameLoginAndPass.index)) {
                this.sendAlreadyConnectedResponse(client);
                return;
            }
        }
        const user = sameLoginAndPass;
        const responseRegData = {
            name: user.name,
            index: user.index,
            error: false,
            errorText: '',
        };
        const responseReg = {
            type: 'reg',
            data: JSON.stringify(responseRegData),
            id: 0,
        };
        client.userIndex = user.index;
        client.send(JSON.stringify(responseReg));
    }
    updateWinners() {
        if (!this.webSocketServer) {
            return;
        }
        const responseUpdateData = [...this.users.values()].map(({ name, wins }) => ({
            name,
            wins,
        }));
        const response = {
            type: 'update_winners',
            data: JSON.stringify(responseUpdateData),
            id: 0,
        };
        const responseString = JSON.stringify(response);
        this.webSocketServer.clients.forEach((client) => client.send(responseString));
    }
    createRoom(client) {
        const currentUser = this.users.find((u) => u.index === client.userIndex);
        if (!currentUser) {
            return;
        }
        const newRoom = {
            roomUsers: [{ name: currentUser.name, index: currentUser.index }],
            roomId: this.roomsIdCounter++,
        };
        this.rooms.push(newRoom);
    }
    addToRoom(client, data) {
        const { indexRoom } = data;
        const index = this.rooms.findIndex((r) => r.roomId === indexRoom);
        if (index < 0) {
            throw Error('addToRoom: index not found');
        }
        const { userIndex } = client;
        if (userIndex === undefined) {
            throw Error('NOT FOUND');
        }
        const currentUser = this.users.find((u) => u.index === client.userIndex);
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
    sendFreeRooms() {
        const free = this.rooms.filter((r) => r.roomUsers.length === 1);
        const response = {
            type: 'update_room',
            data: JSON.stringify(free),
            id: 0,
        };
        this.webSocketServer.clients.forEach((client) => {
            client.send(JSON.stringify(response));
        });
    }
    createGame(roomIndex) {
        const room = this.rooms[roomIndex];
        if (room.roomUsers.length !== 2) {
            return;
        }
        const id = this.gamesIdCounter++;
        const player1 = room.roomUsers[0].index;
        const player2 = room.roomUsers[1].index;
        console.log(`creating game ${roomIndex}; With players: ${player1} (creator) and ${player2} (added himself (herself))`);
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
            const data = { idGame: id, idPlayer: player };
            const message = {
                type: 'create_game',
                id: 0,
                data: JSON.stringify(data),
            };
            client.send(JSON.stringify(message));
        });
    }
    findClient(index) {
        return [...this.webSocketServer.clients.values()].find((ws) => ws.userIndex === index);
    }
    addShips(data) {
        const gameIndex = this.games.findIndex((game) => game.id === data.gameId);
        if (gameIndex < 0) {
            throw Error(`Game with id ${data.gameId} not found`);
        }
        const playerIndex = this.games[gameIndex].players.findIndex((p) => p.index === data.indexPlayer);
        if (playerIndex < 0) {
            throw Error(`addShips: Player with id ${data.indexPlayer} not found`);
        }
        this.games[gameIndex].players[playerIndex].ships.push(...data.ships.map((ship) => ({
            ...ship,
            aliveCells: new Array(ship.length).fill(true),
        })));
        return gameIndex;
    }
    startGame(gameIndex) {
        this.games[gameIndex].players.forEach((player) => {
            const client = this.findClient(player.index);
            if (!client) {
                throw Error('startGame: WS Client not found');
            }
            const data = {
                currentPlayerIndex: player.index,
                ships: player.ships,
            };
            const message = {
                id: 0,
                type: 'start_game',
                data: JSON.stringify(data),
            };
            client.send(JSON.stringify(message));
        });
    }
    attack(data) {
        const attackResult = this.shootAtShip(data);
        if (attackResult) {
            if (attackResult.status === 'killed' && attackResult.damagedShip) {
                this.setMissStateAfterShipKill(attackResult.gameIndex, attackResult.damagedShip);
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
    shootAtShip(data) {
        const gameIndex = this.gameIndexById(data.gameId);
        if (gameIndex < 0) {
            throw Error('attack: game not found');
        }
        if (data.indexPlayer !== this.games[gameIndex].turn) {
            return null;
        }
        const game = this.games[gameIndex];
        const enemyIndex = game.players[0].index === data.indexPlayer ? 1 : 0;
        const selfIndex = game.players[0].index === data.indexPlayer ? 0 : 1;
        if (game.players[selfIndex].attacks.find((a) => a.y === data.y && a.x === data.x)) {
            return null;
        }
        const attackStatus = this.detectAttackStatus(game.players[enemyIndex], data.x, data.y);
        const attackResponseData = {
            position: { x: data.x, y: data.y },
            status: attackStatus.status,
            currentPlayer: data.indexPlayer,
        };
        const response = {
            type: 'attack',
            id: 0,
            data: JSON.stringify(attackResponseData),
        };
        const responseString = JSON.stringify(response);
        game.players.forEach((player) => {
            const client = this.findClient(player.index);
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
    detectAttackStatus(playerInGame, attackX, attackY) {
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
                        }
                        else {
                            return { status: 'shot', damagedShip: ship };
                        }
                    }
                }
            }
            else if (!ship.direction && ship.position.y === attackY) {
                for (let x = ship.position.x; x < ship.position.x + ship.length; ++x) {
                    if (x === attackX) {
                        ship.aliveCells[x - ship.position.x] = false;
                        if (ship.aliveCells.every((cell) => !cell)) {
                            return { status: 'killed', damagedShip: ship };
                        }
                        else {
                            return { status: 'shot', damagedShip: ship };
                        }
                    }
                }
            }
        }
        return { status: 'miss' };
    }
    setMissStateAfterShipKill(gameIndex, damagedShip) {
        const game = this.games[gameIndex];
        const currentTurn = game.turn;
        const playerIndexInGameArray = game.players.findIndex((player) => player.index === currentTurn);
        if (playerIndexInGameArray < 0) {
            throw new Error('setMissStateAfterShipKill: can not find player by his turn');
        }
        const self = game.players[playerIndexInGameArray].index;
        const positions = this.generateMissesAroundKilledShip(damagedShip);
        game.players[playerIndexInGameArray].attacks.push(...positions);
        game.players.forEach((player) => {
            const client = this.findClient(player.index);
            if (!client) {
                throw Error('createGame: client not found');
            }
            positions.forEach((position) => {
                const attackResponseData = {
                    position: { x: position.x, y: position.y },
                    status: 'miss',
                    currentPlayer: self,
                };
                const message = {
                    type: 'attack',
                    id: 0,
                    data: JSON.stringify(attackResponseData),
                };
                client.send(JSON.stringify(message));
            });
        });
    }
    generateMissesAroundKilledShip(ship) {
        const positions = [];
        const isValidPosition = (position) => {
            return (position.x >= 0 &&
                position.x < constants_1.BOARD_SIZE &&
                position.y >= 0 &&
                position.y < constants_1.BOARD_SIZE);
        };
        if (ship.direction) {
            const shipY = ship.position.y;
            const shipX = ship.position.x;
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
        }
        else if (!ship.direction) {
            const shipY = ship.position.y;
            const shipX = ship.position.x;
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
    gameIndexById(id) {
        return this.games.findIndex((game) => game.id === id);
    }
    switchTurn(gameIndex, skipSwitching = false) {
        if (gameIndex < 0) {
            return;
        }
        const game = this.games[gameIndex];
        const currentTurn = game.turn;
        if (!skipSwitching) {
            if (currentTurn === game.players[0].index) {
                game.turn = game.players[1].index;
            }
            else if (currentTurn === game.players[1].index) {
                game.turn = game.players[0].index;
            }
        }
        const newTurn = this.games[gameIndex].turn;
        const responseData = { currentPlayer: newTurn };
        const response = {
            type: 'turn',
            id: 0,
            data: JSON.stringify(responseData),
        };
        const responseString = JSON.stringify(response);
        game.players.forEach((player) => {
            const client = this.findClient(player.index);
            if (!client) {
                throw Error('createGame: client not found');
            }
            client.send(responseString);
        });
    }
    removeUserAndItsData(client) {
        const userIndex = client.userIndex;
        let index;
        do {
            index = this.rooms.findIndex((room) => room.roomUsers.find((user) => user.index === userIndex));
            if (index >= 0) {
                this.rooms.splice(index, 1);
            }
        } while (index >= 0);
        do {
            index = this.games.findIndex((game) => game.players.find((user) => user.index === userIndex));
            if (index >= 0) {
                this.finishGame(index, true);
                this.games.splice(index, 1);
            }
        } while (index >= 0);
        this.updateWinners();
        this.sendFreeRooms();
    }
    clearServer() {
        this.rooms.length = 0;
        this.users.length = 0;
        this.games.length = 0;
        this.isStarted = false;
    }
    didCurrentPlayerWin(gameIndex) {
        const game = this.games[gameIndex];
        const currentPlayerIndexInArray = game.players.findIndex((player) => player.index === game.turn);
        const enemyIndexInArray = (currentPlayerIndexInArray + 1) % 2;
        if (currentPlayerIndexInArray < 0) {
            throw Error('didCurrentPlayerWin: current player not found');
        }
        return game.players[enemyIndexInArray].ships.every((ship) => {
            return ship.aliveCells.every((cell) => !cell);
        });
    }
    finishGame(gameIndex, draw = false) {
        const game = this.games[gameIndex];
        if (game?.isFinished) {
            return;
        }
        const winner = !draw ? game.turn : -1;
        const finishMessage = { winPlayer: winner };
        const response = {
            type: 'finish',
            data: JSON.stringify(finishMessage),
            id: 0,
        };
        const responseString = JSON.stringify(response);
        game.isFinished = true;
        game.players.forEach((player) => {
            const client = this.findClient(player.index);
            if (!client) {
                return;
            }
            client.send(responseString);
        });
    }
    addWinToUser(userId) {
        const user = this.users.find((user) => user.index === userId);
        if (!user) {
            throw Error(`addWinToUser: user ${userId} does not exist`);
        }
        ++user.wins;
    }
    generateRandomAttackPosition(data) {
        const game = this.games.find((game) => game.id === data.gameId);
        if (!game) {
            throw Error('generateRandomAttackPosition: game not found by id');
        }
        const player = game.players.find((player) => player.index === data.indexPlayer);
        if (!player) {
            throw Error('generateRandomAttackPosition: player not found by id');
        }
        const wasPositionAlreadyUsed = (position) => {
            return player.attacks.some((attack) => attack.x === position.x && attack.y === position.y);
        };
        const maxCoordinate = constants_1.BOARD_SIZE - 1;
        const minCoordinate = 0;
        let x = (0, utils_1.getRandomIntInRange)(minCoordinate, maxCoordinate);
        let y = (0, utils_1.getRandomIntInRange)(minCoordinate, maxCoordinate);
        while (wasPositionAlreadyUsed({ x, y })) {
            x = (0, utils_1.getRandomIntInRange)(minCoordinate, maxCoordinate);
            y = (0, utils_1.getRandomIntInRange)(minCoordinate, maxCoordinate);
        }
        return { x, y };
    }
    isUserAlreadyConnected(userId) {
        return [...this.webSocketServer.clients.values()].some((client) => {
            if (client.readyState === ws_1.default.OPEN &&
                client.userIndex === userId) {
                return true;
            }
        });
    }
    sendAlreadyConnectedResponse(client) {
        const responseRegData = {
            error: true,
            errorText: 'You already connected from another tab or browser or device',
        };
        const responseReg = {
            type: 'reg',
            data: JSON.stringify(responseRegData),
            id: 0,
        };
        client.send(JSON.stringify(responseReg));
    }
    sendNotValidPasswordResponse(client) {
        const responseRegData = {
            error: true,
            errorText: 'User with such login already exists, but password is not correct !',
        };
        const responseReg = {
            type: 'reg',
            data: JSON.stringify(responseRegData),
            id: 0,
        };
        client.send(JSON.stringify(responseReg));
    }
}
exports.GameServer = GameServer;
