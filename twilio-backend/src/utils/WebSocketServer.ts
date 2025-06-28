import { WebSocketServer, WebSocket } from 'ws';
import http from 'http';

interface TwilioMediaMessage {
  event: string;
  start?: any;
  media?: { payload: string };
  stop?: any;
  streamSid?: string;
  mark?: any;
}

export const initializeWebSocketServer = (server: http.Server) => {
  const wss = new WebSocketServer({ server, path: '/twiml' });

  wss.on('connection', (ws: WebSocket) => {
    console.log('Twilio MediaStream connected');

    ws.on('message', (message: Buffer) => {
      try {
        const data = JSON.parse(message.toString()) as TwilioMediaMessage;

        switch (data.event) {
          case 'start':
            console.log('Media stream started:', data.start);
            break;

          case 'media':
            if (data.media?.payload) {
              const audioBuffer = Buffer.from(data.media.payload, 'base64');
              console.log(`Received ${audioBuffer.length} bytes of audio`);
              // TODO: Send to Deepgram or log, etc.
            }
            break;

          case 'stop':
            console.log('Media stream ended');
            break;

          case 'mark':
            console.log('Mark received:', data.mark);
            break;
            // can be used to mark events that happend and are sent via the connection
          default:
            console.log('Unrecognized event:', data.event);
        }
      } catch (err) {
        console.error('Error parsing message:', err);
      }
    });

    ws.on('close', () => {
      console.log('WebSocket connection closed');
    });

    ws.send(
      JSON.stringify({
        event: 'connected',
        message: 'Hello from WebSocket server!',
      })
    );
  });

  console.log('WebSocket server initialized and listening for Twilio Media Streams');
  return wss;
};
