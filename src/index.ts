import app from "./app";
import { env } from "./env";

const server = app.listen(env.PORT, async () => {
   console.log(`Server is running on http://localhost:${env.PORT} in ${env.NODE_ENV.toUpperCase()} mode`);
});

server.keepAliveTimeout = 600000;
server.headersTimeout = 610000;
server.timeout = 600000;

export default app;
