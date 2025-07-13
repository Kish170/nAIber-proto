import express from 'express';
import dotenv from 'dotenv';
import ElevenLabsWebhook from './routes/ElevenLabsWebhook'
import TwilioOutbound from './routes/TwilioOutbound'
import TwimlRouter from './routes/TwimlRouter'
import { WebSocketServer } from 'ws';
import path from 'path';
import http from 'http';
import { setupOutboundMediaStream } from './ws/OutboundMediaStream';
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const app = express();
app.use(express.urlencoded({ extended: false }));
app.use(express.json());

app.get('/', (req, res) => {
  res.send('Hello from nAIber backend! ElevenLabs Conversational AI integration ready.');
});

// API routes
app.use('/api', ElevenLabsWebhook);
app.use('/api', TwilioOutbound);
app.use('/twiml', TwimlRouter)

const PORT = process.env.PORT || 3000;
const server = http.createServer(app);

const wss = new WebSocketServer({ server, path: '/outbound-media-stream' });
setupOutboundMediaStream(wss);

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`ElevenLabs webhook available at: https://4973188fcbd8.ngrok-free.app/api/elevenlabs-webhook`);
});
