import express from 'express';
import WebSocket from "ws";
import dotenv from "dotenv";
import Twilio from "twilio";
import path from 'path'

dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const twilioClient = Twilio(accountSid, authToken);
const router = express.Router();

if (!accountSid || !authToken) {
    console.error('Missing required Twilio environment variables. Check TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN in .env file.');
    throw new Error('Twilio configuration error: Missing required environment variables');
}

async function getSignedUrl() {
  try {
    const response = await fetch(
      `https://api.elevenlabs.io/v1/convai/conversation/get_signed_url?agent_id=${process.env.ELEVENLABS_AGENT_ID}`,
      {
        method: "GET",
        headers: {
          "xi-api-key": `${process.env.ELEVENLABS_API_KEY}`,
        },
      }
    );

    if (!response.ok) {
      throw new Error(`Failed to get signed URL: ${response.statusText}`);
    }

    const data = await response.json();
    return data.signed_url;
  } catch (error) {
    console.error("Error getting signed URL:", error);
    throw error;
  }
}

router.post("/call",async (req, res) => {

  try {
    const call = await twilioClient.calls.create({
      from: `${process.env.TWILIO_NUMBER}`,
      to: "+16476191727",
      url: `${process.env.TWILIO_URL}`
    });

    res.send({
      success: true,
      message: "Call initiated",
      callSid: call.sid,
    });
  } catch (error) {
    console.error("Error initiating outbound call:", error);
    res.send({
      success: false,
      error: "Failed to initiate call",
    });
  }
});

export default router;
