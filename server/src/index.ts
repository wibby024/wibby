import "dotenv/config";
import http from "http";
import app from "./app.js";
import { connectToDatabase } from "./lib/mongodb.js";
import { initializeSocket } from "./socket/index.js";

const PORT = Number(process.env.PORT) || 3000;

async function startServer() {
  try {
    await connectToDatabase();
    
    const server = http.createServer(app);
    
    // Initialize Socket.IO
    initializeSocket(server);

    server.listen(PORT, () => {
      console.log(`Wibby server running on http://localhost:${PORT}`);
    });
  } catch (error) {
    console.error("Failed to start server", error);
    process.exit(1);
  }
}

startServer();
