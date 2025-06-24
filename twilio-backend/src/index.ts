import express from 'express';
import dotenv from 'dotenv';
import OutboundRoute from './routes/OutboundRoute'
import path from 'path';
dotenv.config({ path: path.resolve(__dirname, './.env') });


const app = express();
app.use(express.json());

console.log("ENV LOADED?", process.env.TWILIO_ACCOUNT_SID ? "✅" : "❌");

app.get('/', (req, res) => {
  res.send('Hello from Twilio backend!');
});

app.use('/api', OutboundRoute)

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
