import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';

const router = Router();

const ProgressSchema = z.object({
  userId: z.string().uuid(),
  lessonId: z.string().uuid(),
  score: z.number().int().min(0),
  stars: z.number().int().min(0).max(3),
  accuracy: z.number().min(0).max(100),
  completed: z.boolean(),
});

router.post('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = ProgressSchema.parse(req.body);
    
    // Check if progress exists
    const existing = await prisma.progress.findFirst({
      where: { userId: data.userId, lessonId: data.lessonId },
    });

    if (existing) {
      if (data.score > existing.score) {
        const updated = await prisma.progress.update({
          where: { id: existing.id },
          data: {
            score: data.score,
            stars: Math.max(existing.stars, data.stars),
            accuracy: Math.max(existing.accuracy, data.accuracy),
            completed: existing.completed || data.completed,
            playedAt: new Date(),
          },
        });
        return res.json(updated);
      }
      return res.json(existing); // keep best
    }

    const progress = await prisma.progress.create({ data });
    res.status(201).json(progress);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors });
    }
    next(error);
  }
});

router.get('/leaderboard/:lessonId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const topScores = await prisma.progress.findMany({
      where: { lessonId: req.params.lessonId },
      orderBy: { score: 'desc' },
      take: 10,
      include: {
        user: { select: { name: true } },
      },
    });
    res.json(topScores);
  } catch (error) {
    next(error);
  }
});

router.get('/stats/:userId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const stats = await prisma.progress.aggregate({
      where: { userId: req.params.userId },
      _count: { id: true },
      _avg: { accuracy: true },
      _sum: { stars: true },
    });
    
    const completedCount = await prisma.progress.count({
      where: { userId: req.params.userId, completed: true },
    });

    res.json({
      totalSessions: stats._count.id,
      avgAccuracy: stats._avg.accuracy || 0,
      totalStars: stats._sum.stars || 0,
      completedLessons: completedCount,
    });
  } catch (error) {
    next(error);
  }
});

export default router;
