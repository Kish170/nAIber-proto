import express from 'express';
import { questionAndResponseHandling } from '../services/Onboarding';
const VoiceResponse = require('twilio').twiml.VoiceResponse;

const router = express.Router();

const steps = [
  "Are you onboarding yourself or someone else?",
  "What is your name?",
  "What is your age?",
  "Do you have any accessibility needs?",
];

router.post('/onboarding', async (req, res) => {
  const step = parseInt(req.query.step as string || '0');
  const userResponse = req.body.SpeechResult;

  if (userResponse) {
    console.log(`User answered: ${userResponse}`);
  }

  if (step >= steps.length) {
    const twiml = new VoiceResponse();
    twiml.say("Thanks! You're all set.");
    return res.type('text/xml').send(twiml.toString());
  }

  const message = step === 0 ? "Welcome to nAIber onboarding!" : "Thanks!";
  const question = steps[step];

  const twiml = await questionAndResponseHandling(message, question, step + 1);
  res.type('text/xml').send(twiml);
});

export default router;
