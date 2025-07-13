import { createClient, ListenLiveClient, LiveTranscriptionEvents } from "@deepgram/sdk";

const deepgramClient = createClient(process.env.DEEPGRAM_API_KEY || '');

export class DeepgramSTT {
  private deepgram: ListenLiveClient;
  private keepAlive!: NodeJS.Timeout;

  constructor() {
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

  public send(message: Buffer) {
    if (this.deepgram.getReadyState() === 1 /* OPEN */) {
      console.log("ws: data sent to deepgram");
      this.deepgram.send(message);
    } else if (this.deepgram.getReadyState() >= 2 /* 2 = CLOSING, 3 = CLOSED */) {
      console.log("ws: data couldn't be sent to deepgram");
      console.log("ws: retrying connection to deepgram");
      this.close();
      this.deepgram = deepgramClient.listen.live({
        model: 'nova-3',
        smart_format: true,
        language: 'en-US',
        endpointing: 200,
        encoding: 'mulaw',
        sample_rate: 8000
      });
      this.setupListeners();
    } else {
      console.log("ws: data couldn't be sent to deepgram");
    }
  }

  private setupListeners() {
    this.keepAlive = setInterval(() => {
      this.deepgram.keepAlive();
    }, 10000);

    this.deepgram.addListener(LiveTranscriptionEvents.Open, () => {
      console.log('Deepgram connected');
    });

    this.deepgram.addListener(LiveTranscriptionEvents.Error, (err) => {
      console.error('Deepgram error:', err);
    });

    this.deepgram.addListener(LiveTranscriptionEvents.Close, () => {
      console.log('Deepgram connection closed');
      clearInterval(this.keepAlive);
    });
  }

  public addTranscriptListener(callback: (transcript: any) => void) {
    this.deepgram.addListener(LiveTranscriptionEvents.Transcript, callback);
  }

  public close() {
    this.deepgram.requestClose();
    this.deepgram.removeAllListeners();
    clearInterval(this.keepAlive);
  }
}
