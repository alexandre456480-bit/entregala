import { createServer } from "node:http";
import handler from "./handler";
createServer((req, res) => {
  void handler(req, res);
}).listen(3001, "127.0.0.1", () =>
  console.log("API local: http://127.0.0.1:3001"),
);
