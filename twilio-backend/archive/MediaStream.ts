import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

const VoiceResponse = require('twilio').twiml.VoiceResponse;

export const startMediaStream = (): String => {
  const response = new VoiceResponse();

  const connect = response.connect();
  connect.stream({
    url: process.env.STREAM_URL,
    parameters: [],
  });

  return response.toString()
}
