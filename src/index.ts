import { createServer } from "http";
import app from "./app";
import { env } from "./env";

const server = createServer(app);

server.listen(env.PORT, async () => {
   console.log(`Server is running on http://localhost:${env.PORT} in ${env.NODE_ENV.toUpperCase()} mode`);
});

// 10-minute timeouts
server.keepAliveTimeout = 600000;
server.headersTimeout = 610000;
server.timeout = 600000;

export default app;
