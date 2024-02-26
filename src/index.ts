import { httpServer } from './http_server/index';
import { BattleshipServer } from './websocket';

const HTTP_PORT = 8181;

const server = new BattleshipServer(3000);
server.startServer();

console.log(`Start static http server on the ${HTTP_PORT} port!`);
httpServer.listen(HTTP_PORT);
