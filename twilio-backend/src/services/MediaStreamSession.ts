import { WebSocket } from 'ws';
import { TwilioMediaMessage } from '../types/Types';
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
    this.askQuestion();
  }

  private async askQuestion() {
    if (this.questionManager.isComplete(this.currentQuestionIndex)) {
      this.ws.send(JSON.stringify({ message: "All questions answered. Thank you!", complete: true }));
      console.log('All questions answered, closing connection.');
      this.close();
    } else {
      const questionObj = this.questionManager.getNextQuestion(this.currentQuestionIndex);
      if (questionObj) {
        const question = questionObj.text;
        this.elevenlabs.textToSpeech(question, this.ws, this.streamSid);
        console.log(`Asking question ${this.currentQuestionIndex}: ${question}`);
        this.ws.send(JSON.stringify({ question: question, index: this.currentQuestionIndex }));
      } else {
        this.ws.send(JSON.stringify({ message: "No more questions available.", complete: true }));
        console.log('No more questions available, closing connection.');
        this.close();
      }
    }
  }

  public async handleMessage(message: string) {
    try {
      const data = JSON.parse(message) as TwilioMediaMessage;

      switch (data.event) {
        case 'start':
          this.streamSid = data.streamSid || '';
          if (this.currentQuestionIndex === 0) {
            this.askQuestion();
          }
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
        const currentQuestion = this.questionManager.getNextQuestion(this.currentQuestionIndex);
        if (currentQuestion) {
          const isValid = await this.questionManager.storeResponse(currentQuestion, text);
          if (isValid) {
            this.ws.send(JSON.stringify({ transcript: text, index: this.currentQuestionIndex, valid: true }));
            this.currentQuestionIndex++;
          } else {
            this.ws.send(JSON.stringify({ transcript: text, index: this.currentQuestionIndex, valid: false, message: "Response was not valid. Please answer again." }));
            // Re-ask the same question if the response is not valid
          }
        }
        this.askQuestion();
      }
    });
  }

  public close() {
    this.questionManager.getResponses()
    this.questionManager.clearResponses()
    this.deepgram.close();
  }
}
