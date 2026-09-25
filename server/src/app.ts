import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";

const app = express();

// Trust Nginx reverse proxy headers (X-Forwarded-For, X-Forwarded-Proto)
app.set("trust proxy", 1);

const isProd = process.env.NODE_ENV === "production";
const rawClientUrls = process.env.CLIENT_URL || (isProd ? "https://wibby024.web.app,https://wibby024.firebaseapp.com,https://wibby.web.app" : "http://localhost:5173");
const allowedOrigins = rawClientUrls
  .split(",")
  .map((s) => s.trim().replace(/\/$/, ""))
  .filter(Boolean);

if (!isProd) {
  allowedOrigins.push(
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:5174",
    "http://127.0.0.1:5174",
    "http://localhost:3000",
    "http://127.0.0.1:3000"
  );
}

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (like mobile apps, curl, server-to-server)
      if (!origin) return callback(null, true);
      const normalizedOrigin = origin.replace(/\/$/, "");
      if (allowedOrigins.includes(normalizedOrigin)) {
        return callback(null, true);
      }
      if (!isProd && (origin.startsWith("http://localhost:") || origin.startsWith("http://127.0.0.1:"))) {
        return callback(null, true);
      }
      return callback(new Error(`CORS policy violation for origin: ${origin}`));
    },
    credentials: true,
  })
);

app.use(helmet());

app.use(
  express.json({
    limit: "1mb",
  })
);

app.use(
  rateLimit({
    windowMs: 60 * 1000,
    limit: 300,
    standardHeaders: true,
    legacyHeaders: false,
  })
);

import healthRoutes from "./routes/health.js";
import usersRoutes from "./routes/users.js";
import pairingRoutes from "./routes/pairing.js";
import messagesRouter from "./routes/messages.js";
import mediaRouter from "./routes/media.js";
import storiesRouter from "./routes/stories.js";
import storageRouter from "./routes/adminStorage.js";

app.use("/health", healthRoutes);
app.use("/api/users", usersRoutes);
app.use("/api/pairing", pairingRoutes);
app.use("/api/storage", storageRouter);
app.use("/api/conversations/:conversationId/messages", messagesRouter);
app.use("/api/conversations/:conversationId/media", mediaRouter);
app.use("/api/conversations/:conversationId/stories", storiesRouter);
app.use("/api/conversations/:conversationId", messagesRouter);

export default app;
