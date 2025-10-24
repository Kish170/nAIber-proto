import express from 'express';
import dotenv from 'dotenv';
// import OnboardingWebhook from './routes/elevenlabs-webhooks/OnboardingWebhook'
import TwilioOutbound from './routes/TwilioOutbound'
import TwimlRouter from './routes/TwimlRouter'
import CheckUpWebhook from  './routes/elevenlabs-webhooks/CheckUpWebhook'
import { WebSocketServer } from 'ws';
import path from 'path';
import http from 'http';
import { setupOutboundMediaStream } from './utils/OutboundMediaStream';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const app = express();
app.use(express.urlencoded({ extended: false }));
app.use(express.json());

app.get('/', (req, res) => {
  res.send('Hello from nAIber backend! ElevenLabs Conversational AI integration ready.');
});

app.use('/twiml', TwimlRouter)
app.use('/api', TwilioOutbound);
// app.use('/api', OnboardingWebhook)
app.use('/api', CheckUpWebhook)
// app.use('/api', McpServer)

const server = http.createServer(app);

const wss = new WebSocketServer({ server, path: '/outbound-media-stream' });
setupOutboundMediaStream(wss);


const PORT = process.env.PORT || 3000;

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`ElevenLabs webhook available at: https://4973188fcbd8.ngrok-free.app/api/elevenlabs-webhook`);
});
