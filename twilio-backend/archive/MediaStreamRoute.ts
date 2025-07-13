import express from 'express';
import { startMediaStream } from '../services/MediaStream';

const router = express.Router();

router.post('/twiml', (req, res) => {
    res.type('text/xml');
    res.send(startMediaStream());
});

export default router;