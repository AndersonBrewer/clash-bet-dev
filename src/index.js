import 'dotenv/config';
import path from 'path';
import { fileURLToPath } from 'url';
import express from 'express';
import cors from 'cors';
import { usersRouter } from './routes/users.js';
import { gamesRouter } from './routes/games.js';
import { clashesRouter } from './routes/clashes.js';
import { badgesRouter } from './routes/badges.js';
import { startScheduler } from './scheduler.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));

app.use('/api/users', usersRouter);
app.use('/api/games', gamesRouter);
app.use('/api/clashes', clashesRouter);
app.use('/api/badges', badgesRouter);

app.get('/api/health', (req, res) => res.json({ ok: true }));

const port = process.env.PORT || 3001;
app.listen(port, () => {
  console.log(`Clash Bet backend running on http://localhost:${port}`);
});

startScheduler();
