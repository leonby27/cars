import http from "node:http";
import { pool } from "./db.mjs";
import { handleApiRequest } from "./handler.mjs";

const port = Number(process.env.API_PORT || 8787);
const server = http.createServer(handleApiRequest);

// `node --watch` перезапускает сервер, отправляя SIGTERM и дожидаясь выхода процесса.
// Живые keep-alive соединения от vite не дают серверу закрыться сами, поэтому рвём их
// и выходим по таймеру: без этого процесс висел бы навсегда, watch не поднял бы новый,
// и локальный API молча исчезал после правок server/*.mjs.
let closing = false;
const shutdown = async () => {
  if (closing) return;
  closing = true;
  const force = setTimeout(() => process.exit(0), 3000);
  force.unref();
  server.close();
  server.closeAllConnections?.();
  try {
    await pool.end();
  } catch {}
  clearTimeout(force);
  process.exit(0);
};

// Прошлый процесс может ещё держать порт доли секунды после перезапуска: ждём и
// пробуем снова, вместо падения, после которого порт остался бы без сервера.
let retries = 0;
server.on("error", (error) => {
  if (error.code !== "EADDRINUSE" || closing) {
    console.error(error);
    process.exit(1);
  }
  if (retries >= 40) {
    console.error(`Порт ${port} занят: сервер не поднялся за 10 секунд.`);
    process.exit(1);
  }
  retries += 1;
  setTimeout(() => server.listen(port, "0.0.0.0"), 250);
});

server.listen(port, "0.0.0.0", () => console.log(`evcars.by API: http://127.0.0.1:${port}`));

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
