import { Router } from 'express';

export function LLMRouter(): Router {
    const router = Router();

    router.post("v1/chat/completions", (res, req) => {

    })

    return router
}