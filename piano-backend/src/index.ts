import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import dotenv from 'dotenv';
import { prisma } from './lib/prisma';
import { errorHandler } from './middleware/errorHandler';

import usersRouter from './routes/users';
import lessonsRouter from './routes/lessons';
import progressRouter from './routes/progress';
import uploadRouter from './routes/upload';

dotenv.config();

const app = express();
app.set('trust proxy', 1);
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" },
}));
app.use(morgan('dev'));
app.use(express.json());

// Serve static files from public/uploads
app.use('/uploads', express.static('public/uploads'));

app.use('/api/users', usersRouter);
app.use('/api/lessons', lessonsRouter);
app.use('/api/progress', progressRouter);
app.use('/api/upload', uploadRouter);

app.get('/', (req, res) => {
  res.send('KidsPiano Backend API is running! Access the frontend at http://localhost:3000');
});

app.get('/health', async (req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ status: 'ok', timestamp: new Date(), database: 'connected' });
  } catch (error) {
    res.status(503).json({ status: 'error', timestamp: new Date(), database: 'disconnected' });
  }
});

app.use(errorHandler);

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
