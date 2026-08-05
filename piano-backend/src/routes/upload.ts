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

    const { title, level, tempo, description, simplify } = req.body;
    if (!title || !level || !tempo) {
      return res.status(400).json({ error: 'title, level, and tempo are required' });
    }

    const midiFile = files.midiFile[0];
    const sheetFile = files.sheetFile?.[0];
    const thumbnailFile = files.thumbnailFile?.[0];

    const baseUrl = `${req.protocol}://${req.get('host')}`;
    
    const midiFileUrl = `${baseUrl}/uploads/midi/${midiFile.filename}`;
    let sheetMusicUrl: string | undefined = undefined;
    if (sheetFile) {
      const ext = path.extname(sheetFile.originalname).toLowerCase();
      let subfolder = 'misc';
      if (ext === '.mid' || ext === '.midi' || ext === '.xml' || ext === '.mxl') subfolder = 'midi';
      else if (ext === '.pdf') subfolder = 'pdf';
      else if (['.png', '.jpg', '.jpeg'].includes(ext)) subfolder = 'images';
      sheetMusicUrl = `${baseUrl}/uploads/${subfolder}/${sheetFile.filename}`;
    }
    let thumbnailUrl = undefined;
    if (thumbnailFile) {
      thumbnailUrl = `${baseUrl}/uploads/images/${thumbnailFile.filename}`;
    }

    // Call midi-service to parse the file
    const formData = new FormData();
    formData.append('file', fs.createReadStream(midiFile.path));
    if (simplify === 'true') {
      formData.append('simplify', 'true');
    }
    
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

    // If midi-service returned XML content, save it and use it as sheetMusicUrl if no PDF was uploaded
    if (midiJsonData.xml_content) {
      const xmlFilename = `score-${Date.now()}.xml`;
      const xmlDir = path.join(process.cwd(), 'public', 'uploads', 'xml');
      fs.mkdirSync(xmlDir, { recursive: true });
      const xmlPath = path.join(xmlDir, xmlFilename);
      fs.writeFileSync(xmlPath, midiJsonData.xml_content);
      
      if (!sheetMusicUrl) {
        sheetMusicUrl = `${baseUrl}/uploads/xml/${xmlFilename}`;
      }
      
      // Remove xml_content from JSON to save space before writing
      delete midiJsonData.xml_content;
      fs.writeFileSync(jsonPath, JSON.stringify(midiJsonData));
    }

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
