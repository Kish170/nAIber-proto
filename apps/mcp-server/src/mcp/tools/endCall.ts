import { z } from 'zod';
import { RedisClient, TwilioClient } from '@naiber/shared-clients';

const END_CALL_DELAY_MS = 10000;

export const endCallSchema = {
    conversationId: z.string().describe('ElevenLabs conversation ID for the current call'),
};

export async function endCallHandler(args: { conversationId: string }) {
    const { conversationId } = args;

    setTimeout(async () => {
        try {
            const session = await RedisClient.getInstance().getJSON<{ callSid?: string }>(`session:${conversationId}`);
            const callSid = session?.callSid;

            if (!callSid) {
                console.warn('[endCall] No callSid found for conversation:', conversationId);
                return;
            }

            const twilioClient = new TwilioClient({
                accountSid: process.env.TWILIO_ACCOUNT_SID!,
                authToken: process.env.TWILIO_AUTH_TOKEN!,
            });

            const result = await twilioClient.endCall(callSid);
            if (result.success) {
                console.log('[endCall] Call ended via Twilio for conversation:', conversationId);
            } else {
                console.error('[endCall] Failed to end call:', result.error);
            }
        } catch (err) {
            console.error('[endCall] Error ending call:', err);
        }
    }, END_CALL_DELAY_MS);

    return { scheduled: true };
}
