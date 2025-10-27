import express from 'express';

const router = express.Router();

router.all('/', (req, res) => {
    const agentId = req.query.agent_id as string;
    
    console.log(`[TwiML] Received request with agent: ${agentId}`);
    
    if (!agentId) {
        console.error('[TwiML] Missing agent_id parameter');
        const errorTwiml = `
        <Response>
            <Say>I'm sorry, there was a technical issue. Please try calling again.</Say>
        </Response>`;
        return res.type('text/xml').send(errorTwiml);
    }

    const twiml = `
        <Response>
        <Connect>
            <Stream url="${process.env.STREAM_URL}">
            <Parameter name="agent_id" value="${agentId}" />
            </Stream>
        </Connect>
        </Response>`;

    res.type('text/xml').send(twiml);
});

export default router;
