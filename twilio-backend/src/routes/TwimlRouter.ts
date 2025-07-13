import express from 'express';

const router = express.Router();

router.all('/', (req, res) => {

  const twiml = `
    <Response>
      <Connect>
        <Stream url="${process.env.STREAM_URL}">
        </Stream>
      </Connect>
    </Response>`;

  res.type('text/xml').send(twiml);
});

export default router;
