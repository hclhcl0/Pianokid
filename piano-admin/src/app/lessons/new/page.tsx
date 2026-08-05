'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Save, Upload, Wand2 } from 'lucide-react';
import Link from 'next/link';

const formSchema = z.object({
  title: z.string().min(2, 'Title is required'),
  level: z.coerce.number().min(1).max(5),
  tempo: z.coerce.number().min(60).max(200),
  description: z.string().optional(),
  midiFile: z.any(),
  sheetFile: z.any(),
  thumbnailFile: z.any(),
});

type FormData = z.infer<typeof formSchema>;

export default function NewLessonPage() {
  const router = useRouter();
  const [simplify, setSimplify] = useState(false);
  const { register, handleSubmit, setValue, getValues, formState: { errors, isSubmitting } } = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      level: 1,
      tempo: 100,
    }
  });

  const onSubmit = async (data: FormData) => {
    try {
      const midiFiles = data.midiFile as FileList;
      if (!midiFiles || midiFiles.length === 0) {
        alert("Please select a MIDI file!");
        return;
      }

      const formData = new FormData();
      formData.append('title', data.title);
      formData.append('level', data.level.toString());
      formData.append('tempo', data.tempo.toString());
      if (data.description) {
        formData.append('description', data.description);
      }
      formData.append('simplify', simplify ? 'true' : 'false');
      formData.append('midiFile', midiFiles[0]);

      const sheetFiles = data.sheetFile as FileList;
      if (sheetFiles && sheetFiles.length > 0) {
        formData.append('sheetFile', sheetFiles[0]);
      }

      const thumbnailFiles = data.thumbnailFile as FileList;
      if (thumbnailFiles && thumbnailFiles.length > 0) {
        formData.append('thumbnailFile', thumbnailFiles[0]);
      }

      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
      const res = await fetch(`${apiUrl}/api/upload/lesson`, {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || 'Upload failed');
      }

      alert("Lesson created successfully!");
      router.push('/lessons');
    } catch (error: any) {
      console.error(error);
      alert(error.message);
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/lessons" className="p-2 text-slate-500 hover:bg-slate-200 rounded-lg transition-colors">
          <ArrowLeft size={20} />
        </Link>
        <h1 className="text-3xl font-bold text-slate-900">Add New Lesson</h1>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="bg-white p-6 rounded-xl shadow-sm border border-slate-100 space-y-6">
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Title *</label>
            <input 
              {...register('title')} 
              className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-primary-500 focus:outline-none"
              placeholder="e.g. Twinkle Twinkle Little Star"
            />
            {errors.title && <p className="text-red-500 text-xs mt-1">{errors.title.message}</p>}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Level *</label>
              <select 
                {...register('level')} 
                className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-primary-500 focus:outline-none"
              >
                {[1,2,3,4,5].map(l => <option key={l} value={l}>Level {l}</option>)}
              </select>
              {errors.level && <p className="text-red-500 text-xs mt-1">{errors.level.message}</p>}
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Tempo (BPM) *</label>
              <input 
                type="number" 
                {...register('tempo')} 
                className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-primary-500 focus:outline-none"
              />
              {errors.tempo && <p className="text-red-500 text-xs mt-1">{errors.tempo.message}</p>}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 p-4 bg-slate-50 rounded-lg border border-slate-200">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                <Upload size={16} className="inline mr-1" /> MIDI/XML File (.mid, .xml, .mxl) *
              </label>
              <input 
                type="file"
                accept=".mid,.midi,.xml,.mxl"
                {...register('midiFile', {
                  onChange: (e) => {
                    const files = e.target.files;
                    if (files && files.length > 0) {
                      const file = files[0];
                      const title = file.name.replace(/\.[^/.]+$/, ""); // Strip extension
                      const currentTitle = getValues('title');
                      if (!currentTitle || currentTitle.trim() === '') {
                         setValue('title', title, { shouldValidate: true });
                      }
                    }
                  }
                })} 
                className="w-full text-sm text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-primary-50 file:text-primary-700 hover:file:bg-primary-100"
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                <Upload size={16} className="inline mr-1" /> Sheet Music (.pdf)
              </label>
              <input 
                type="file"
                accept=".pdf"
                {...register('sheetFile')} 
                className="w-full text-sm text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-primary-50 file:text-primary-700 hover:file:bg-primary-100"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                <Upload size={16} className="inline mr-1" /> Thumbnail Image (.jpg/.png)
              </label>
              <input 
                type="file"
                accept="image/*"
                {...register('thumbnailFile')} 
                className="w-full text-sm text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-primary-50 file:text-primary-700 hover:file:bg-primary-100"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Description</label>
            <textarea 
              {...register('description')} 
              rows={4}
              className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-primary-500 focus:outline-none resize-none"
            />
          </div>

          {/* Simplify Option */}
          <div className={`p-4 rounded-xl border-2 transition-colors cursor-pointer select-none ${
            simplify ? 'border-violet-400 bg-violet-50' : 'border-slate-200 bg-slate-50 hover:border-slate-300'
          }`} onClick={() => setSimplify(v => !v)}>
            <div className="flex items-start gap-3">
              <div className={`mt-0.5 w-5 h-5 rounded flex items-center justify-center flex-shrink-0 ${
                simplify ? 'bg-violet-600' : 'bg-white border-2 border-slate-300'
              }`}>
                {simplify && <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>}
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <Wand2 size={16} className={simplify ? 'text-violet-600' : 'text-slate-400'} />
                  <span className="font-semibold text-slate-800">Đơn giản hóa bản nhạc</span>
                  <span className="text-xs px-2 py-0.5 bg-violet-100 text-violet-700 rounded-full font-medium">Khuyến nghị cho trẻ em</span>
                </div>
                <p className="mt-1 text-sm text-slate-500">
                  Tự động rút gọn các hợp âm phức tạp: tay phải chỉ giữ nốt cao nhất (giai điệu chính), tay trái chỉ giữ nốt trầm nhất (nốt gốc bass). Phù hợp với các bài hát người lớn muốn chuyển thành bài tập cho trẻ.
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="pt-4 flex justify-end">
          <button 
            type="submit" 
            disabled={isSubmitting}
            className="flex items-center gap-2 px-6 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-500 transition-colors disabled:opacity-50"
          >
            {isSubmitting ? 'Uploading & Processing...' : <><Save size={20} /> Save Lesson</>}
          </button>
        </div>
      </form>
    </div>
  );
}
