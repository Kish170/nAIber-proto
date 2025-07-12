import { WebSocket } from 'ws';
import { TwilioMediaMessage, UserResponse } from '../types/Types';
import { QuestionManager } from './QuestionManager';
import { DeepgramSTT } from '../utils/DeepgramSTT';
import { ElevenLabsTTS } from '../utils/ElevenLabsTTS';

const VoiceResponse = require('twilio').twiml.VoiceResponse;

export class MediaStreamSession {
  private ws: WebSocket;
  private deepgram: DeepgramSTT;
  private elevenlabs: ElevenLabsTTS;
  private questionManager: QuestionManager;
  private currentQuestionIndex: number;
  private streamSid!: String;
  private responses: string[];

  constructor(ws: WebSocket) {
    this.ws = ws;
    this.deepgram = new DeepgramSTT();
    this.elevenlabs = new ElevenLabsTTS();
    this.questionManager = new QuestionManager();
    this.currentQuestionIndex = 0;
    this.responses = [];
    this.streamSid = '';
    this.setupListeners();
    this.askQuestion("Greet the user and tell them about the process of creating a user for them");
  }

  private async askQuestion(userResponse: string) {
    const modelResponse = await this.questionManager.validateResponse(userResponse)
    if (modelResponse != null) {
      const message = modelResponse.content.toString()
      this.elevenlabs.textToSpeech(message, this.ws, this.streamSid);
    } else {
      this.ws.send(JSON.stringify({ message: "No more questions available.", complete: true }));
      console.log('Closing connection.');
      this.close();
    }
  }

  public async handleMessage(message: string) {
    try {
      const data = JSON.parse(message) as TwilioMediaMessage;

      switch (data.event) {
        case 'start':
          this.streamSid = data.streamSid || '';
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
      this.deepgram.send(message);
    }
  }

  private setupListeners() {
    this.deepgram.addTranscriptListener(async (transcript) => {
      const alt = transcript.channel?.alternatives?.[0];
      const text = alt?.transcript;
      if (transcript.is_final && text) {
        console.log(`Transcript for question ${this.currentQuestionIndex + 1}: ${text}`);
        this.responses.push(text);
        this.askQuestion(text);
      }
    });
  }

  public close() {
    this.deepgram.close();
  }
}
