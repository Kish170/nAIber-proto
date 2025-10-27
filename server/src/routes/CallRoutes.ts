import { Router } from 'express';
import { CallController } from '../controllers/CallController.js';

export function createCallRouter(callController: CallController) {
    const router = Router();

    router.post('/call', async (req, res) => {
        try {
            const result = await callController.createCall();
            res.json(result);
        } catch (error) {
            console.error('[CallRoutes] Error creating call:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to create call'
            });
        }
    });

    router.post('/twiml', (req, res) => {
        try {
            const twiml = callController.generateStreamTwiml();
            res.type('text/xml').send(twiml);
        } catch (error) {
            console.error('[CallRoutes] Error generating TwiML:', error);
            res.status(500).type('text/xml').send(
                '<Response><Say>Service temporarily unavailable</Say></Response>'
            );
        }
    });

    return router;
}