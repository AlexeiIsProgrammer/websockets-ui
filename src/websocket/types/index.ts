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

export interface RegistrationData extends Omit<User, 'password' | 'wins'> {
  error: boolean;
  errorText: string;
}
