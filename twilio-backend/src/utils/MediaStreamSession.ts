import { WebSocket } from 'ws';
import { TwilioMediaMessage } from '../types/Types';
import { QuestionManager } from '../services/QuestionManager';
import { DeepgramSTT } from './DeepgramSTT';
import { ElevenLabsTTS } from './ElevenLabsTTS';

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
    this.setupListeners();
  }

  private async askQuestion() {
    if (this.questionManager.isComplete(this.currentQuestionIndex)) {
      this.ws.send(JSON.stringify({ message: "All questions answered. Thank you!", complete: true }));
      console.log('All questions answered, closing connection.');
      this.close();
    } else {
      const question = this.questionManager.getQuestion(this.currentQuestionIndex);
      console.log(`Asking question ${this.currentQuestionIndex + 1}: ${question}`);
      this.elevenlabs.textToSpeech(question, this.ws, this.streamSid)
      this.ws.send(JSON.stringify({ question: question, index: this.currentQuestionIndex }));
    }
  }

  public async handleMessage(message: string) {
    try {
      const data = JSON.parse(message) as TwilioMediaMessage;

      switch (data.event) {
        case 'start':
          this.streamSid = data.streamSid|| '';
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
    this.deepgram.addTranscriptListener((transcript) => {
      const alt = transcript.channel?.alternatives?.[0];
      const text = alt?.transcript;
      if (transcript.is_final && text) {
        console.log(`Transcript for question ${this.currentQuestionIndex + 1}: ${text}`);
        this.responses.push(text);
        this.ws.send(JSON.stringify({ transcript: text, index: this.currentQuestionIndex }));
        this.currentQuestionIndex++;
        this.askQuestion();
      }
    });
  }

  public close() {
    this.deepgram.close();
  }
}
