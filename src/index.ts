import app from "./app";
import { env } from "./env";
app.listen(env.PORT, async () => {
   console.log(`Server is running on http://localhost:${env.PORT} in ${env.NODE_ENV.toUpperCase()} mode`);
});

export default app;
