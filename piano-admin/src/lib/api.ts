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

const baseUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
const API_URL = baseUrl.endsWith('/api') ? baseUrl : `${baseUrl}/api`;

// Mock functions for now
export async function fetchLessons(): Promise<Lesson[]> {
  const res = await fetch(`${API_URL}/lessons`);
  if (!res.ok) throw new Error('Failed to fetch lessons');
  const json = await res.json();
  return json.data || [];
}

export async function fetchStats() {
  return {};
}

export async function fetchRecentProgress(): Promise<ProgressRecord[]> {
  return [];
}

export async function togglePublish(id: string, isPublished: boolean) {
  const res = await fetch(`${API_URL}/lessons/${id}/publish`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ isPublished })
  });
  if (!res.ok) throw new Error('Failed to update publish status');
  return res.json();
}

export async function deleteLesson(id: string) {
  const res = await fetch(`${API_URL}/lessons/${id}`, {
    method: 'DELETE'
  });
  if (!res.ok) throw new Error('Failed to delete lesson');
  return true;
}
