import express from 'express';
import dotenv from 'dotenv';
import OnboardingWebhook from './routes/elevenlabs-webhooks/OnboardingWebhook'
import TwilioOutbound from './routes/TwilioOutbound'
import TwimlRouter from './routes/TwimlRouter'
import CheckUpWebhook from  './routes/elevenlabs-webhooks/CheckUpWebhook'
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
app.use('/api', TwilioOutbound);
app.use('/twiml', TwimlRouter)
app.use('/api', OnboardingWebhook)
app.use('/api', CheckUpWebhook)

const PORT = process.env.PORT || 3000;
const server = http.createServer(app);

const wss = new WebSocketServer({ server, path: '/outbound-media-stream' });
setupOutboundMediaStream(wss);

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`ElevenLabs webhook available at: https://4973188fcbd8.ngrok-free.app/api/elevenlabs-webhook`);
});
