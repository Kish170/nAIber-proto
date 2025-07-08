import express from 'express';
import dotenv from 'dotenv';
import OutboundRoute from './routes/OutboundRoute'
import OnboardingRoute from './routes/OnboardingRoute'
import MediaStreamRoute from './routes/MediaStreamRoute'
import path from 'path';
import { initializeWebSocketServer } from './utils/WebSocketServer';
import http from 'http';
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const app = express();
app.use(express.urlencoded({ extended: false })); // <-- this is critical
app.use(express.json());


app.get('/', (req, res) => {
  res.send('Hello from Twilio backend!');
});

app.use('/api', OutboundRoute)

app.use('/', OnboardingRoute)

app.use('/', MediaStreamRoute)

const PORT = process.env.PORT || 3000;
const server = http.createServer(app);

initializeWebSocketServer(server);

server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
