export type AuthData = {
  name: string;
  password: string;
};

export type User = {
  index: number;
  wins: number;
} & AuthData;

export type TypeOfMessage =
  | 'reg'
  | 'create_room'
  | 'add_user_to_room'
  | 'create_game'
  | 'add_ships'
  | 'start_game'
  | 'turn'
  | 'attack'
  | 'randomAttack'
  | 'finish'
  | 'update_room'
  | 'update_winners';

export type Message = {
  type: TypeOfMessage;
  data: string;
  id: 0;
};

export type RegistrationData = {
  error: boolean;
  errorText: string;
} & Omit<User, 'password' | 'wins'>;

export type UserInRoom = Pick<User, 'index'> & Pick<AuthData, 'name'>;
export type Room = {
  roomUsers: UserInRoom[];
  roomId: number;
};

export type Position = {
  x: number;
  y: number;
};

export type ShipSize = 'small' | 'medium' | 'large' | 'huge';

export type Ship = {
  position: Position;
  direction: boolean;
  length: number;
  type: ShipSize;
  aliveCells: boolean[];
};

export type PlayerInGame = {
  index: number;
  ships: Ship[];
  attacks: Position[];
};
export type Game = {
  id: number;
  players: [PlayerInGame, PlayerInGame];
  turn: number;
  isFinished: boolean;
};

export type CreateGameData = {
  idGame: number;
  idPlayer: number;
};

export type AddToRoomData = {
  indexRoom: number;
};

export type FinishGameData = {
  winPlayer: number;
};
