import twilio from "twilio";
import dotenv from 'dotenv';
import path from 'path';

// Load environment variables from .env file
dotenv.config({ path: path.resolve(__dirname, '../.env') });

// Validate required environment variables
const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;

if (!accountSid || !authToken) {
  console.error('Missing required Twilio environment variables. Check TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN in .env file.');
  throw new Error('Twilio configuration error: Missing required environment variables');
}

const client = twilio(accountSid, authToken);

export default client;
