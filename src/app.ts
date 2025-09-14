import bodyParser from "body-parser";
import compression from "compression";
import cors from "cors";
import express from "express";
import helmet from "helmet";
import morgan from "morgan";
import { config } from "./config/app.config";
import errorMiddleware from "./middlewares/error.middleware";
import fileRoutes from "./routes/file.routes";
import userRoutes from "./routes/user.routes";

const app = express();

const payloadLimit = "50mb";

app.use(helmet(config.helemt));

app.use(express.json({ limit: payloadLimit }));
app.use(
   express.urlencoded({
      extended: true,
      limit: payloadLimit
   })
);

app.use(compression(config.compression));
app.use(cors(config.cors));
app.use(morgan("dev"));

app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
   if (err.status === 413 || err.code === "LIMIT_FILE_SIZE" || err.type === "entity.too.large") {
      return res.status(413).json({
         message: "File too large. Maximum size allowed is 50MB",
         success: false,
         error: "PAYLOAD_TOO_LARGE"
      });
   }
   next(err);
});

app.use((req, res, next) => {
   res.on("finish", () => {
      if (res.statusCode === 413) {
         res.json({
            message: "File too large. Maximum size allowed is 5MB.",
            success: false,
            error: "FILE_TOO_LARGE"
         });
      }
   });
   next();
});

app.use("/api/v1/users", userRoutes);
app.use("/api/v1/files", fileRoutes);

app.get("/", async (req, res) => {
   console.log(req.headers["user-agent"]);
   return res.status(200).json({
      message: "Server is running",
      success: true
   });
});

app.use("*", (req, res) => {
   return res.status(404).json({
      message: "Route not found",
      success: false
   });
});

app.use(errorMiddleware);

export default app;
