import { Router, Request, Response } from 'express';

export function StatusRouter(): Router {
    const router = Router();

    router.get("/health", async (req: Request, res: Response) => {
        res.status(200).json({ 
            status: 'healthy', 
            service: 'naiber-llm-server',
            timestamp: new Date().toISOString()
        });
    });

    return router;
}