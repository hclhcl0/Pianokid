import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';

const router = Router();

const LessonSchema = z.object({
  title: z.string().min(1),
  level: z.number().int().min(1),
  midiJsonUrl: z.string().url(),
  midiFileUrl: z.string().url().optional(),
  sheetMusicUrl: z.string().url().optional(),
  tempo: z.number().int().min(1),
  thumbnail: z.string().url().optional(),
  description: z.string().optional(),
});

router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const skip = (page - 1) * limit;
    
    const where: any = {};
    if (req.query.level) where.level = parseInt(req.query.level as string);
    if (req.query.published) where.isPublished = req.query.published === 'true';

    const [lessons, total] = await Promise.all([
      prisma.lesson.findMany({ where, skip, take: limit }),
      prisma.lesson.count({ where }),
    ]);

    res.json({ data: lessons, meta: { page, limit, total } });
  } catch (error) {
    next(error);
  }
});

router.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const lesson = await prisma.lesson.findUnique({
      where: { id: req.params.id },
      include: {
        _count: {
          select: { progress: true },
        },
      },
    });
    if (!lesson) {
      return res.status(404).json({ error: 'Lesson not found' });
    }
    res.json(lesson);
  } catch (error) {
    next(error);
  }
});

router.post('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = LessonSchema.parse(req.body);
    const lesson = await prisma.lesson.create({ data });
    res.status(201).json(lesson);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors });
    }
    next(error);
  }
});

router.put('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = LessonSchema.partial().parse(req.body);
    const lesson = await prisma.lesson.update({
      where: { id: req.params.id },
      data,
    });
    res.json(lesson);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors });
    }
    next(error);
  }
});

router.patch('/:id/publish', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { isPublished } = z.object({ isPublished: z.boolean() }).parse(req.body);
    const lesson = await prisma.lesson.update({
      where: { id: req.params.id },
      data: { isPublished },
    });
    res.json(lesson);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors });
    }
    next(error);
  }
});

router.delete('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    await prisma.$transaction([
      prisma.progress.deleteMany({ where: { lessonId: req.params.id } }),
      prisma.lesson.delete({ where: { id: req.params.id } }),
    ]);
    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

export default router;
