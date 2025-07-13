import { ElevenLabsClient } from '@elevenlabs/elevenlabs-js';
import { Readable } from 'stream';
import { WebSocket } from 'ws';

const elevenLabs = new ElevenLabsClient({ apiKey: process.env.ELEVENLABS_API_KEY! });

export class ElevenLabsTTS {
  async textToSpeech(text: string, ws: WebSocket, streamSid: String, voiceId: string = `${process.env.ELEVENLABS_VOICE_ID}`): Promise<Buffer> {
    const response = await elevenLabs.textToSpeech.convert(voiceId, {
      text,
      modelId: 'eleven_multilingual_v2',
      outputFormat: 'ulaw_8000'
    });
    const readableStream = Readable.from(response as any);
    const audioArrayBuffer = await this.streamToArrayBuffer(readableStream);
    ws.send(
      JSON.stringify({
        streamSid,
        event: 'media',
        media: {
          payload: Buffer.from(audioArrayBuffer as any).toString('base64'),
        },
      })
    );
    return Buffer.from(audioArrayBuffer);
  }

  private async streamToArrayBuffer(readableStream: Readable): Promise<ArrayBuffer> {
    return new Promise<ArrayBuffer>((resolve, reject) => {
      const chunks: Buffer[] = [];
      readableStream.on('data', (chunk) => {
        chunks.push(chunk);
      });
      readableStream.on('end', () => {
        resolve(Buffer.concat(chunks).buffer);
      });
      readableStream.on('error', reject);
    });
  }
}
