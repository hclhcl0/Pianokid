'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Plus, Search, Edit2, Trash2, CheckCircle, XCircle } from 'lucide-react';
import { fetchLessons, togglePublish, deleteLesson, Lesson } from '../../lib/api';

export default function LessonsPage() {
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [search, setSearch] = useState('');
  const [level, setLevel] = useState('all');

  useEffect(() => {
    // Mock fetch for now
    fetchLessons().then(setLessons).catch(console.error);
  }, []);

  const filteredLessons = lessons.filter(l => 
    l.title.toLowerCase().includes(search.toLowerCase()) && 
    (level === 'all' || l.level.toString() === level)
  );

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold text-slate-900">Lessons Management</h1>
        <Link href="/lessons/new" className="flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-500 transition-colors">
          <Plus size={20} /> Add Lesson
        </Link>
      </div>

      <div className="flex gap-4 bg-white p-4 rounded-lg shadow-sm border border-slate-100">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
          <input 
            type="text" 
            placeholder="Search lessons..." 
            className="w-full pl-10 pr-4 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <select 
          className="px-4 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 bg-white"
          value={level}
          onChange={(e) => setLevel(e.target.value)}
        >
          <option value="all">All Levels</option>
          <option value="1">Level 1</option>
          <option value="2">Level 2</option>
          <option value="3">Level 3</option>
          <option value="4">Level 4</option>
          <option value="5">Level 5</option>
        </select>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
        <table className="w-full text-left">
          <thead className="bg-slate-50">
            <tr className="border-b border-slate-200 text-slate-500 text-sm">
              <th className="py-3 px-4 font-medium">Thumbnail</th>
              <th className="py-3 px-4 font-medium">Title</th>
              <th className="py-3 px-4 font-medium">Level</th>
              <th className="py-3 px-4 font-medium">Tempo (BPM)</th>
              <th className="py-3 px-4 font-medium">Status</th>
              <th className="py-3 px-4 font-medium text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredLessons.map((lesson) => (
              <tr key={lesson.id} className="border-b border-slate-50 hover:bg-slate-50 transition-colors">
                <td className="py-3 px-4">
                  <div className="w-12 h-12 bg-slate-200 rounded-lg overflow-hidden">
                    {lesson.thumbnail ? (
                      <img src={lesson.thumbnail} alt={lesson.title} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-slate-400 text-xs">No img</div>
                    )}
                  </div>
                </td>
                <td className="py-3 px-4 font-medium text-slate-900">{lesson.title}</td>
                <td className="py-3 px-4">
                  <span className="px-2 py-1 bg-primary-50 text-primary-700 rounded text-xs font-medium">
                    Level {lesson.level}
                  </span>
                </td>
                <td className="py-3 px-4">{lesson.tempo}</td>
                <td className="py-3 px-4">
                  <button 
                    onClick={async () => {
                      try {
                        await togglePublish(lesson.id, !lesson.isPublished);
                        setLessons(lessons.map(l => l.id === lesson.id ? { ...l, isPublished: !lesson.isPublished } : l));
                      } catch (e) {
                        alert('Failed to update publish status');
                      }
                    }}
                    className={`flex items-center gap-1 text-sm font-medium px-3 py-1 rounded-full transition-colors ${
                      lesson.isPublished 
                        ? 'text-green-700 bg-green-100 hover:bg-green-200' 
                        : 'text-slate-600 bg-slate-100 hover:bg-slate-200'
                    }`}
                  >
                    {lesson.isPublished ? (
                      <><CheckCircle size={16} /> Published</>
                    ) : (
                      <><XCircle size={16} /> Draft</>
                    )}
                  </button>
                </td>
                <td className="py-3 px-4">
                  <div className="flex justify-end gap-2">
                    <Link href={`/lessons/${lesson.id}/tab-editor`}
                      className="p-2 text-slate-400 hover:text-purple-600 hover:bg-purple-50 rounded transition-colors"
                      title="Tab Editor">
                      🎹
                    </Link>
                    <button className="p-2 text-slate-400 hover:text-primary-600 hover:bg-primary-50 rounded transition-colors" title="Edit">
                      <Edit2 size={18} />
                    </button>
                    <button 
                      onClick={async () => {
                        if (confirm('Are you sure you want to delete this lesson?')) {
                          try {
                            await deleteLesson(lesson.id);
                            setLessons(lessons.filter(l => l.id !== lesson.id));
                          } catch (e) {
                            alert('Failed to delete lesson');
                          }
                        }
                      }}
                      className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors" 
                      title="Delete"
                    >
                      <Trash2 size={18} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {filteredLessons.length === 0 && (
              <tr>
                <td colSpan={6} className="py-8 text-center text-slate-500">
                  No lessons found matching your filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
