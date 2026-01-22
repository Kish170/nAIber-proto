import { Router } from 'express';
import { CallController } from '../controllers/CallController.js';
import { CallController2 } from '../controllers/CallController2.js';

export function createCallRouter(callController: CallController, callController2: CallController2): Router {
    const router = Router();

    router.post('/call', async (req, res) => {
        try {
            const result = await callController.createCall('general');
            res.json(result);
        } catch (error) {
            console.error('[CallRoutes] Error creating call:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to create call'
            });
        }
    });

    router.post('/call/health-check', async (req, res) => {
        try {
            const result = await callController.createCall('health_check');
            res.json(result);
        } catch (error) {
            console.error('[CallRoutes] Error creating health check call:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to create health check call'
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

    router.get('/sessions', async (req, res) => {
        try {
            const { sessionManager } = await import('../services/SessionManager.js');
            const sessions = await sessionManager.getAllActiveSessions();
            res.json({
                count: sessions.length,
                sessions
            });
        } catch (error) {
            console.error('[CallRoutes] Error fetching sessions:', error);
            res.status(500).json({ error: 'Failed to fetch sessions' });
        }
    });

    router.post('/call2', async (req, res) => {
        try {
            const result = await callController2.createCall()
            res.json(result);
        } catch (error) {
            console.error('[CallRoutes] Error creating call:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to create call'
            });
        }
    });

    return router;
}