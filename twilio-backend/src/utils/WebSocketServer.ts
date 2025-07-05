import { WebSocketServer, WebSocket } from 'ws';
import http from 'http';
import { MediaStreamSession } from '../services/MediaStreamSession';

export const initializeWebSocketServer = (server: http.Server): void => {
  const wss = new WebSocketServer({ server, path: '/twiml' });

  wss.on('connection', (ws: WebSocket) => {
    console.log('Twilio MediaStream connected');

    const session = new MediaStreamSession(ws);

    ws.on('message', (msg: Buffer) => {
      session.handleMessage(msg.toString());
    });

    ws.on('close', () => {
      console.log('WebSocket closed');
      session.close();
    });

    ws.send(JSON.stringify({ event: 'connected', message: 'WebSocket Ready!' }));
  });

  console.log('WebSocket server initialized at /twiml');
};
