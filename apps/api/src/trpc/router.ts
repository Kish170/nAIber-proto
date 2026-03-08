import { router } from './init.js';
import { caregiverRouter } from '../routers/caregiver.router.js';
import { userRouter } from '../routers/user.router.js';
import { cognitiveRouter } from '../routers/cognitive.router.js';
import { sessionRouter } from '../routers/session.router.js';
import { healthRouter } from '../routers/health.router.js';
import { observationsRouter } from '../routers/observations.router.js';

export const appRouter = router({
    caregiver: caregiverRouter,
    user: userRouter,
    cognitive: cognitiveRouter,
    session: sessionRouter,
    health: healthRouter,
    observations: observationsRouter,
});

export type AppRouter = typeof appRouter;
