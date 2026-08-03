import { Router, Request, Response, NextFunction } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import axios from 'axios';
import FormData from 'form-data';
import { prisma } from '../lib/prisma';

const router = Router();

// Configure multer storage
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    let subfolder = 'misc';
    if (ext === '.mid' || ext === '.midi' || ext === '.xml' || ext === '.mxl') subfolder = 'midi';
    else if (ext === '.pdf') subfolder = 'pdf';
    else if (['.png', '.jpg', '.jpeg'].includes(ext)) subfolder = 'images';
    
    const dir = path.join(process.cwd(), 'public', 'uploads', subfolder);
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({ storage });

router.post('/lesson', upload.fields([
  { name: 'midiFile', maxCount: 1 },
  { name: 'sheetFile', maxCount: 1 },
  { name: 'thumbnailFile', maxCount: 1 }
]), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const files = req.files as { [fieldname: string]: Express.Multer.File[] };
    if (!files.midiFile || !files.midiFile[0]) {
      return res.status(400).json({ error: 'midiFile is required' });
    }

    const { title, level, tempo, description } = req.body;
    if (!title || !level || !tempo) {
      return res.status(400).json({ error: 'title, level, and tempo are required' });
    }

    const midiFile = files.midiFile[0];
    const sheetFile = files.sheetFile?.[0];
    const thumbnailFile = files.thumbnailFile?.[0];

    const baseUrl = `${req.protocol}://${req.get('host')}`;
    
    const midiFileUrl = `${baseUrl}/uploads/midi/${midiFile.filename}`;
    let sheetMusicUrl = undefined;
    if (sheetFile) {
      sheetMusicUrl = `${baseUrl}/uploads/pdf/${sheetFile.filename}`;
    }
    let thumbnailUrl = undefined;
    if (thumbnailFile) {
      thumbnailUrl = `${baseUrl}/uploads/images/${thumbnailFile.filename}`;
    }

    // Call midi-service to parse the file
    const formData = new FormData();
    formData.append('file', fs.createReadStream(midiFile.path));
    
    // In docker, midi-service is reachable at http://midi-service:8000
    // But locally we might use localhost. Let's use env var or fallback
    const midiServiceUrl = process.env.MIDI_SERVICE_URL || 'http://localhost:8000';
    
    const parseResponse = await axios.post(`${midiServiceUrl}/parse`, formData, {
      headers: formData.getHeaders()
    });

    const midiJsonData = parseResponse.data;

    // Save JSON to disk
    const jsonFilename = `parsed-${Date.now()}.json`;
    const jsonDir = path.join(process.cwd(), 'public', 'uploads', 'json');
    fs.mkdirSync(jsonDir, { recursive: true });
    const jsonPath = path.join(jsonDir, jsonFilename);
    fs.writeFileSync(jsonPath, JSON.stringify(midiJsonData));
    
    const midiJsonUrl = `${baseUrl}/uploads/json/${jsonFilename}`;

    // Create Lesson in database
    const lesson = await prisma.lesson.create({
      data: {
        title,
        level: parseInt(level),
        tempo: parseInt(tempo),
        description,
        midiFileUrl,
        sheetMusicUrl,
        thumbnail: thumbnailUrl,
        midiJsonUrl
      }
    });

    res.status(201).json(lesson);
  } catch (error) {
    if (axios.isAxiosError(error)) {
      console.error('MIDI Service Error:', error.response?.data || error.message);
      return res.status(500).json({ error: 'Failed to parse MIDI file' });
    }
    console.error('Upload Error:', error);
    next(error);
  }
});

export default router;
