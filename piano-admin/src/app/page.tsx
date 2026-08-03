'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { PlusCircle, Trophy, BookOpen, Users, PlayCircle, Star } from 'lucide-react';
import StatCard from '../components/ui/StatCard';
import { fetchStats, fetchRecentProgress, ProgressRecord } from '../lib/api';

export default function Dashboard() {
  const [stats, setStats] = useState({
    totalLessons: 0,
    activeUsers: 0,
    sessionsToday: 0,
    avgStars: 0,
  });
  const [recentProgress, setRecentProgress] = useState<ProgressRecord[]>([]);

  useEffect(() => {
    // In a real app we'd use react-query, fetching mock data for now based on instructions
    setStats({
      totalLessons: 24,
      activeUsers: 156,
      sessionsToday: 342,
      avgStars: 2.8,
    });
    
    // Mock recent progress
    setRecentProgress([
      { id: '1', user: { name: 'Alice' }, lesson: { title: 'Twinkle Twinkle' }, score: 850, stars: 3, playedAt: new Date().toISOString() },
      { id: '2', user: { name: 'Bob' }, lesson: { title: 'Mary Had a Little Lamb' }, score: 620, stars: 2, playedAt: new Date().toISOString() },
    ] as any);
  }, []);

  return (
    <div className="space-y-8">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold text-slate-900">Dashboard</h1>
        <div className="flex gap-4">
          <Link href="/lessons/new" className="flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-500 transition-colors">
            <PlusCircle size={20} /> Add New Lesson
          </Link>
          <button className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 text-slate-700 rounded-lg hover:bg-slate-50 transition-colors">
            <Trophy size={20} /> View Leaderboard
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard title="Total Lessons" value={stats.totalLessons} icon={<BookOpen size={24} className="text-primary-500" />} trend="+3 this week" />
        <StatCard title="Active Users" value={stats.activeUsers} icon={<Users size={24} className="text-secondary-500" />} trend="+12% vs last month" />
        <StatCard title="Sessions Today" value={stats.sessionsToday} icon={<PlayCircle size={24} className="text-accent-500" />} trend="+45 vs yesterday" />
        <StatCard title="Avg Stars" value={stats.avgStars} icon={<Star size={24} className="text-yellow-500" />} trend="Steady" />
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-6">
        <h2 className="text-xl font-semibold mb-4">Recent Activity</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-slate-200 text-slate-500">
                <th className="py-3 px-4 font-medium">User</th>
                <th className="py-3 px-4 font-medium">Lesson</th>
                <th className="py-3 px-4 font-medium">Score</th>
                <th className="py-3 px-4 font-medium">Stars</th>
                <th className="py-3 px-4 font-medium">Time</th>
              </tr>
            </thead>
            <tbody>
              {recentProgress.map((p) => (
                <tr key={p.id} className="border-b border-slate-50 last:border-0 hover:bg-slate-50">
                  <td className="py-3 px-4">{p.user?.name}</td>
                  <td className="py-3 px-4">{p.lesson?.title}</td>
                  <td className="py-3 px-4 font-mono">{p.score}</td>
                  <td className="py-3 px-4 flex gap-1">
                    {Array.from({ length: 3 }).map((_, i) => (
                      <Star key={i} size={16} className={i < p.stars ? 'text-yellow-400 fill-yellow-400' : 'text-slate-200'} />
                    ))}
                  </td>
                  <td className="py-3 px-4 text-slate-500 text-sm">
                    {new Date(p.playedAt).toLocaleTimeString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
