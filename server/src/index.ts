import express from 'express';
import http from 'http';
import { CallController } from './controllers/CallController.js';
import { createCallRouter } from './routes/CallRoutes.js';
import { sessionManager } from './services/SessionManager.js';

// Initialize SessionManager
await sessionManager.initialize();

const app = express();
const callController = new CallController();

app.use(express.urlencoded({ extended: false }));
app.use(express.json());

// Mount call routes
app.use(createCallRouter(callController));

const server = http.createServer(app);
await callController.initializeWSServer(server);

const PORT = process.env.PORT || 3000;

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`ElevenLabs webhook available at: https://4973188fcbd8.ngrok-free.app/api/elevenlabs-webhook`);
});
