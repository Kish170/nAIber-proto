import express from 'express';
import { makeOutboundCall } from '../services/OutboundCall';

const router = express.Router();

router.post('/call', async (req, res) => {

  try {
    const call = await makeOutboundCall("+16476191727", process.env.TWILIO_NUMBER!, process.env.TWILIO_URL!);
    res.status(200).json({ success: true, callSid: call.sid });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: 'Failed to initiate call' });
  }
});

export default router;
