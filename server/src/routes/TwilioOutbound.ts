// import express from 'express';
// import dotenv from "dotenv";
// import Twilio from "twilio";
// import path from 'path'

// dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

// const accountSid = process.env.TWILIO_ACCOUNT_SID;
// const authToken = process.env.TWILIO_AUTH_TOKEN;
// const twilioClient = Twilio(accountSid, authToken);
// const router = express.Router();

// if (!accountSid || !authToken) {
//     console.error('Missing required Twilio environment variables. Check TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN in .env file.');
//     throw new Error('Twilio configuration error: Missing required environment variables');
// }

// router.post("/call/onboarding", async (req, res) => {
//   try {
//     const { to } = req.body;
//     const targetNumber = to || "+16476191727";
    
//     const result = await makeCall(
//       targetNumber, 
//       process.env.ELEVENLABS_ONBOARDING_AGENT_ID!
//     );
    
//     res.json(result);
//   } catch (error) {
//     console.error("Error initiating onboarding call:", error);
//     res.json({ success: false, error: "Failed to initiate onboarding call" });
//   }
// });

// router.post("/call/pol-check", async (req, res) => {
//   try {
//     const { to } = req.body;
//     const targetNumber = to || "+16476191727";
    
//     const result = await makeCall(
//       targetNumber, 
//       process.env.ELEVENLABS_POL_AGENT_ID!
//     );
    
//     res.json(result);
//   } catch (error) {
//     console.error("Error initiating PoL call:", error);
//     res.json({ success: false, error: "Failed to initiate PoL call" });
//   }
// });

// async function makeCall(to: string, agentID: string) {
//   try {
//     const call = await twilioClient.calls.create({
//       from: `${process.env.TWILIO_NUMBER}`,
//       to: "+16476191727",
//       url: `${process.env.TWILIO_URL}?agent_id=${agentID}`
//     });

//     return {
//       success: true,
//       message: "Call initiated",
//       callSid: call.sid,
//     }
//   } catch (error) {
//     console.error("Error initiating outbound call:", error);
//     return {
//       success: false,
//       error: "Failed to initiate call",
//     }
//   }
// }

// export default router

