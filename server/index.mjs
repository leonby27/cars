import http from "node:http";
import { pool } from "./db.mjs";
import { handleApiRequest } from "./handler.mjs";

const port = Number(process.env.API_PORT || 8787);
const server = http.createServer(handleApiRequest);

server.listen(port, "0.0.0.0", () => console.log(`cncar.by API: http://127.0.0.1:${port}`));

const shutdown = async () => {
  server.close();
  await pool.end();
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
