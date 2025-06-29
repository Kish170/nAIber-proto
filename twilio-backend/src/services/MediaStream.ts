import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const VoiceResponse = require('twilio').twiml.VoiceResponse;

export const startMediaStream = (): String => {
  const response = new VoiceResponse();

  response.say(
    'This demo application will repeat back what you say. Watch the console to see the media messages. Begin speaking now.'
  );

  const connect = response.connect();
  connect.stream({
    url: process.env.STREAM_URL,
    parameters: [
      {
        name: 'aCustomParameter',
        value: 'aCustomValue that was set in TwiML',
      },
    ],
  });

  response.say('Thank you! The WebSocket has been closed and the next TwiML verb was reached.');

  return response.toString()
}
