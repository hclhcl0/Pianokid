export interface User {
  id: string;
  name: string;
  role: 'KID' | 'PARENT' | 'ADMIN';
  parentId?: string;
}

export interface Lesson {
  id: string;
  title: string;
  level: number;
  tempo: number;
  midiJsonUrl: string;
  thumbnail?: string;
  isPublished: boolean;
}

export interface ProgressRecord {
  id: string;
  user: { name: string };
  lesson: { title: string };
  score: number;
  stars: number;
  playedAt: string;
}

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';

// Mock functions for now
export async function fetchLessons(): Promise<Lesson[]> {
  return [
    { id: '1', title: 'Twinkle Twinkle', level: 1, tempo: 80, midiJsonUrl: '', isPublished: true },
    { id: '2', title: 'Mary Had a Little Lamb', level: 2, tempo: 100, midiJsonUrl: '', isPublished: false },
  ];
}

export async function fetchStats() {
  return {};
}

export async function fetchRecentProgress(): Promise<ProgressRecord[]> {
  return [];
}

export async function togglePublish(id: string, isPublished: boolean) {
  return true;
}

export async function deleteLesson(id: string) {
  return true;
}
