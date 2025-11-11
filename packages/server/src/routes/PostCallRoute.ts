import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import { postCallUpdate, PostCallTranscriptionWebhook } from '../controllers/PostCallController.js';

const router = Router();

router.use('/post-call', (req: Request & { rawBody?: string }, res: Response, next) => {
    let data = '';
    req.setEncoding('utf8');
    
    req.on('data', (chunk) => {
        data += chunk;
    });
    
    req.on('end', () => {
        req.rawBody = data;
        next();
    });
});

router.post('/post-call', async (req: Request & { rawBody?: string }, res: Response) => {
    try {
        console.log('[PostCallRoute] Webhook endpoint hit');
        console.log('[PostCallRoute] Headers:', Object.keys(req.headers));
        console.log('[PostCallRoute] Body length:', req.rawBody?.length || 0);

        const secret = process.env.WEBHOOK_SECRET;
        if (!secret) {
            console.error('[PostCallRoute] WEBHOOK_SECRET not configured');
            return res.status(500).send('Server configuration error');
        }

        const signatureHeader = req.headers['ElevenLabs-Signature'] || 
                               req.headers['elevenlabs-signature'] ||
                               req.headers['Elevenlabs-Signature'];

        console.log('[PostCallRoute] Signature header found:', signatureHeader);

        if (!signatureHeader || typeof signatureHeader !== 'string') {
            console.error('[PostCallRoute] Missing ElevenLabs-Signature header');
            console.log('[PostCallRoute] Available headers:', Object.keys(req.headers));
            return res.status(401).send('Missing signature');
        }

        const headers = signatureHeader.split(',');
        const timestampHeader = headers.find((e) => e.startsWith('t='));
        const signatureValue = headers.find((e) => e.startsWith('v0='));

        if (!timestampHeader || !signatureValue) {
            console.error('[PostCallRoute] Invalid signature format');
            return res.status(401).send('Invalid signature format');
        }

        const timestamp = timestampHeader.substring(2);
        const signature = signatureValue;

        const reqTimestamp = parseInt(timestamp) * 1000;
        const tolerance = Date.now() - 30 * 60 * 1000;

        if (reqTimestamp < tolerance) {
            console.error('[PostCallRoute] Request expired');
            return res.status(403).send('Request expired');
        }

        const message = `${timestamp}.${req.rawBody}`;
        const digest = 'v0=' + crypto.createHmac('sha256', secret).update(message).digest('hex');

        console.log('[PostCallRoute] Expected:', digest);
        console.log('[PostCallRoute] Received:', signature);

        if (signature !== digest) {
            console.error('[PostCallRoute] Signature verification failed');
            return res.status(401).send('Request unauthorized');
        }

        console.log('[PostCallRoute] Signature verified successfully');

        if (!req.rawBody) {
            console.error('[PostCallRoute] No raw body data');
            return res.status(400).send('No body data');
        }

        const webhook: PostCallTranscriptionWebhook = JSON.parse(req.rawBody);

        if (webhook.type !== 'post_call_transcription') {
            console.warn('[PostCallRoute] Unexpected webhook type:', webhook.type);
            return res.status(400).send('Unexpected webhook type');
        }

        await postCallUpdate(webhook);
        res.status(200).send('Webhook processed successfully');

    } catch (error) {
        console.error('[PostCallRoute] Error processing webhook:', error);

        if (error instanceof SyntaxError) {
            return res.status(400).send('Invalid JSON payload');
        } else {
            return res.status(500).send('Internal server error');
        }
    }
});

export default router;
