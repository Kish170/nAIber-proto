import { WebSocket } from 'ws';
import { createClient, ListenLiveClient, LiveTranscriptionEvents } from "@deepgram/sdk";

const deepgramClient = createClient(process.env.DEEPGRAM_API_KEY || '');

interface TwilioMediaMessage {
  event: string;
  media?: { payload: string };
  mark?: any;
  streamSid?: string;
}

export class MediaStreamSession {
  private ws: WebSocket;
  private deepgram: ListenLiveClient;
  private keepAlive!: NodeJS.Timeout;

  constructor(ws: WebSocket) {
    this.ws = ws;
    this.deepgram = deepgramClient.listen.live({
      model: 'nova-3',
      smart_format: true,
      language: 'en-US',
      endpointing: 200,
      encoding: 'mulaw',
      sample_rate: 8000
    });
    this.setupListeners();
  }

  public handleMessage(message: string) {
    try {
      const data = JSON.parse(message) as TwilioMediaMessage;

      switch (data.event) {
        case 'media':
          this.handleMedia(data);
          break;
        case 'mark':
          console.log('Mark received:', data.mark);
          break;
        default:
          console.log('Unhandled event type:', data.event);
      }
    } catch (error) {
      console.error('Error parsing WebSocket message:', error);
    }
  }

  private handleMedia(data: TwilioMediaMessage) {
    const payload = data.media?.payload;
    if (payload) {
      const message = Buffer.from(payload, 'base64');
      if (this.deepgram.getReadyState() === 1 /* OPEN */) {
        console.log("ws: data sent to deepgram");
        this.deepgram.send(message);
      } else if (this.deepgram.getReadyState() >= 2 /* 2 = CLOSING, 3 = CLOSED */) {
        console.log("ws: data couldn't be sent to deepgram");
        console.log("ws: retrying connection to deepgram");
        /* Attempt to reopen the Deepgram connection */
        this.close()
        this.deepgram = deepgramClient.listen.live({ smart_format: true, model: 'nova-3' });
        this.setupListeners()
      } else {
        console.log("ws: data couldn't be sent to deepgram");
      }
    }
  }

  private setupListeners() {
    this.keepAlive = setInterval(() => {
      this.deepgram.keepAlive();
    }, 10000);

    this.deepgram.addListener(LiveTranscriptionEvents.Open, () => {
      console.log('Deepgram connected');
    });

    this.deepgram.addListener(LiveTranscriptionEvents.Transcript, (transcript) => {
      const alt = transcript.channel?.alternatives?.[0];
      const text = alt?.transcript;
      if (transcript.is_final && text) {
        console.log(`Transcript: ${text}`);
        this.ws.send(JSON.stringify({ transcript: text }));

        // TODO: Process input (LangChain, database, etc.)
      }
    });

    this.deepgram.addListener(LiveTranscriptionEvents.Error, (err) => {
      console.error('Deepgram error:', err);
    });

    this.deepgram.addListener(LiveTranscriptionEvents.Close, () => {
      console.log('Deepgram connection closed');
      clearInterval(this.keepAlive);
    });
  }

  public close() {
    this.deepgram.requestClose();
    this.deepgram.removeAllListeners
    clearInterval(this.keepAlive);
  }
}
