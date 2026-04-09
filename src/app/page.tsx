'use client';

import React, { useState, useEffect } from 'react';
import UploadZone from '@/components/UploadZone';
import ProgressTracker from '@/components/ProgressTracker';
import ResultCard from '@/components/ResultCard';
import { extractAndDeduplicateFrames } from '@/lib/ffmpegService';
import { stringSimilarity } from '@/lib/stringSim';
import { supabase } from '@/lib/supabase';
import { v4 as uuidv4 } from 'uuid';
import { Download, Copy, AlertCircle } from 'lucide-react';

type StepStatus = 'idle' | 'active' | 'completed';

interface Question {
  id: string;
  question_text?: string;
  raw_text: string;
  question_type: string;
  options: any;
  thumbnail_base64?: string;
  thumbnail_url?: string;
  answer?: string | null;
  explanation?: string | null;
  confidence?: string | null;
  selected_option?: string | null;
  question_number?: number;
}

export default function Home() {
  const [appState, setAppState] = useState<'UPLOAD' | 'PROCESSING' | 'RESULTS'>('UPLOAD');
  const [isOverLimit, setIsOverLimit] = useState(false);
  const [usageCount, setUsageCount] = useState(0);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [steps, setSteps] = useState([
    { id: 'extract', label: 'Extracting frames...', status: 'idle' as StepStatus, subtext: '' },
    { id: 'detect', label: 'Detecting questions...', status: 'idle' as StepStatus, subtext: '' },
    { id: 'solve', label: 'Solving questions...', status: 'idle' as StepStatus, subtext: '' },
    { id: 'done', label: 'Done!', status: 'idle' as StepStatus, subtext: '' },
  ]);

  const [finalQuestions, setFinalQuestions] = useState<Question[]>([]);
  const [subject, setSubject] = useState('Unknown');
  const [jobId, setJobId] = useState('');

  useEffect(() => {
    const uses = parseInt(localStorage.getItem('testscan_uses') || '0', 10);
    setUsageCount(uses);
    if (uses >= 3) {
      setIsOverLimit(true);
    }
  }, []);

  const updateStep = (id: string, status: StepStatus, subtext?: string) => {
    setSteps(prev => prev.map(s => s.id === id ? { ...s, status, subtext: subtext ?? s.subtext } : s));
  };

  const handleUpload = async (file: File) => {
    // Increment usage
    const newCount = usageCount + 1;
    localStorage.setItem('testscan_uses', newCount.toString());
    setUsageCount(newCount);

    setAppState('PROCESSING');
    setErrorMsg(null);
    setSteps(prev => prev.map(s => ({ ...s, status: 'idle', subtext: '' })));

    try {
      // Step 1: Extract frames
      updateStep('extract', 'active');
      const frames = await extractAndDeduplicateFrames(file);
      updateStep('extract', 'completed');

      if (frames.length === 0) {
        throw new Error("No usable frames extracted. Video might be too short or empty.");
      }

      // Step 2: Detect Questions
      updateStep('detect', 'active', `Checking ${frames.length} frames...`);
      let allDetected: Question[] = [];
      let noQuestionFrames = 0;

      for (let i = 0; i < frames.length; i++) {
        const frame = frames[i];
        try {
          const res = await fetch('/api/detect', {
            method: 'POST',
            body: JSON.stringify({ imageBase64: frame.rawBase64Data }),
            headers: { 'Content-Type': 'application/json' }
          });
          const data = await res.json();
          if (data.questions && data.questions.length > 0) {
            allDetected.push(...data.questions.map((q: any) => ({
              ...q,
              id: uuidv4(),
              thumbnail_base64: frame.base64
            })));
          } else {
            noQuestionFrames++;
          }
        } catch (e) {
          console.error("Detect frame failed", e);
        }
      }

      if (noQuestionFrames / frames.length > 0.8) {
        throw new Error("No questions detected. Make sure your video clearly shows the test.");
      }

      // Cross-frame deduplication (similarity > 85%)
      const uniqueFound: Question[] = [];
      for (const q of allDetected) {
        if (!q.question_text || q.question_text.trim().length < 5) continue;
        
        let isDuplicate = false;
        for (let i = 0; i < uniqueFound.length; i++) {
          const uq = uniqueFound[i];
          const sim = stringSimilarity(q.question_text, uq.raw_text);
          if (sim > 0.85) {
            // Keep the longer text version
            if (q.question_text.length > uq.raw_text.length) {
              uniqueFound[i] = {
                ...uq,
                raw_text: q.question_text,
                options: q.options || uq.options
              };
            }
            isDuplicate = true;
            break;
          }
        }
        if (!isDuplicate) {
          uniqueFound.push({ ...q, raw_text: q.question_text });
        }
      }

      // Re-number
      uniqueFound.forEach((q, idx) => { q.question_number = idx + 1; });
      updateStep('detect', 'completed');

      // Step 3: Solve Unique
      updateStep('solve', 'active', `Solving ${uniqueFound.length} questions...`);
      for (const q of uniqueFound) {
        try {
          const res = await fetch('/api/solve', {
            method: 'POST',
            body: JSON.stringify({ question_text: q.raw_text, question_type: q.question_type, options: q.options }),
            headers: { 'Content-Type': 'application/json' }
          });
          const solveData = await res.json();
          q.answer = solveData.answer;
          q.explanation = solveData.explanation;
          q.confidence = solveData.confidence;
          q.selected_option = solveData.selected_option;
        } catch (e) {
          q.answer = null;
          q.confidence = 'low';
        }
      }
      updateStep('solve', 'completed');

      // Predict subject
      updateStep('done', 'active', 'Finalizing...');
      try {
        const clsRes = await fetch('/api/classify', {
          method: 'POST',
          body: JSON.stringify({ questions: uniqueFound }),
          headers: { 'Content-Type': 'application/json' }
        });
        const clsData = await clsRes.json();
        setSubject(clsData.subject || 'Other');
      } catch (e) {
        setSubject('Other');
      }

      // Save to Supabase (Upload images, create Job, create Questions)
      const jId = uuidv4();
      setJobId(jId);

      // We won't block UI entirely for image upload if it is slow, but we will wait here for simplicity.
      let solvedCount = 0;
      for (const q of uniqueFound) {
        if (q.answer) solvedCount++;
        if (q.thumbnail_base64) {
          try {
            const fetchRes = await fetch(q.thumbnail_base64);
            const blob = await fetchRes.blob();
            const fileName = `${jId}/${q.id}.jpg`;
            const { data } = await supabase.storage.from('test-frames').upload(fileName, blob);
            if (data?.path) {
              const { data: publicUrlData } = supabase.storage.from('test-frames').getPublicUrl(data.path);
              q.thumbnail_url = publicUrlData.publicUrl;
            }
          } catch(e) { console.error("Image upload failed", e); }
        }
      }

      await supabase.from('jobs').insert([{
        id: jId,
        status: 'completed',
        subject: subject,
        total_questions: uniqueFound.length,
        solved_count: solvedCount
      }]);

      for (const q of uniqueFound) {
        await supabase.from('questions').insert([{
          id: q.id,
          job_id: jId,
          question_number: q.question_number,
          thumbnail_url: q.thumbnail_url || null,
          raw_text: q.raw_text,
          question_type: q.question_type,
          options: q.options,
          answer: q.answer,
          explanation: q.explanation,
          confidence: q.confidence
        }]);
      }

      setFinalQuestions(uniqueFound);
      updateStep('done', 'completed');
      
      // small delay to show done state
      setTimeout(() => setAppState('RESULTS'), 800);

    } catch (err: any) {
      setErrorMsg(err.message || 'An unexpected error occurred during processing.');
      setAppState('UPLOAD');
    }
  };

  const highConfCount = finalQuestions.filter(q => q.confidence?.toLowerCase() === 'high').length;
  const confidencePercent = finalQuestions.length ? Math.round((highConfCount / finalQuestions.length) * 100) : 0;

  return (
    <div className="min-h-screen bg-[#FAFAFA] font-sans selection:bg-indigo-100 selection:text-indigo-900">
      {/* Header */}
      <header className="bg-white border-b border-gray-100 sticky top-0 z-50">
        <div className="max-w-5xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-indigo-600 text-white flex items-center justify-center font-bold text-lg leading-none">
              T
            </div>
            <span className="font-bold text-xl text-gray-900 tracking-tight">TestScan</span>
          </div>
          {appState === 'RESULTS' && (
            <div className="flex items-center gap-3">
              <button className="hidden sm:flex text-sm font-semibold text-gray-600 hover:text-gray-900 items-center gap-1.5 transition-colors" onClick={() => {
                const text = finalQuestions.map(q => `${q.question_number}. ${q.answer}`).join('\\n');
                navigator.clipboard.writeText(text);
                alert('Answers copied to clipboard!');
              }}>
                <Copy className="w-4 h-4" /> Copy All Answers
              </button>
              <button className="text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 items-center gap-1.5 px-4 py-2 rounded-lg transition-colors flex shadow-sm">
                <Download className="w-4 h-4" /> Download PDF
              </button>
            </div>
          )}
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-5xl mx-auto px-4 py-12">
        {appState === 'UPLOAD' && (
          <div className="pt-10">
            {errorMsg && (
              <div className="mb-8 p-4 bg-red-50 text-red-700 border border-red-100 rounded-xl flex items-center gap-3 max-w-2xl mx-auto">
                <AlertCircle className="w-5 h-5 shrink-0" />
                <span className="font-medium">{errorMsg}</span>
                <button onClick={() => setErrorMsg(null)} className="ml-auto text-sm font-bold opacity-70 hover:opacity-100">Dismiss</button>
              </div>
            )}
            <UploadZone onUpload={handleUpload} isOverLimit={isOverLimit} />
          </div>
        )}

        {appState === 'PROCESSING' && (
          <div className="pt-20">
            <ProgressTracker steps={steps} />
          </div>
        )}

        {appState === 'RESULTS' && (
          <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
            {/* Summary Card */}
            <div className="bg-white rounded-3xl p-6 md:p-8 shadow-sm border border-gray-100 grid grid-cols-1 md:grid-cols-3 gap-6 divide-y md:divide-y-0 md:divide-x divide-gray-100">
              <div className="text-center md:pb-0 pb-4">
                <p className="text-sm font-medium text-gray-500 mb-1">Total Questions</p>
                <h3 className="text-4xl font-bold text-gray-900">{finalQuestions.length}</h3>
              </div>
              <div className="text-center md:pt-0 pt-4">
                <p className="text-sm font-medium text-gray-500 mb-1">Subject Detected</p>
                <div className="inline-block mt-1 px-4 py-1.5 rounded-full bg-indigo-50 text-indigo-700 font-bold text-lg">
                  {subject}
                </div>
              </div>
              <div className="text-center md:pt-0 pt-4">
                <p className="text-sm font-medium text-gray-500 mb-1">Solved Confidently</p>
                <h3 className="text-4xl font-bold text-gray-900 text-green-500">{confidencePercent}%</h3>
              </div>
            </div>

            {/* Questions List */}
            <div className="space-y-6">
              {finalQuestions.map((q) => (
                <ResultCard
                  key={q.id}
                  questionNumber={q.question_number || 0}
                  thumbnailUrl={q.thumbnail_base64 || q.thumbnail_url || null}
                  rawText={q.raw_text}
                  answer={q.answer || null}
                  explanation={q.explanation || null}
                  confidence={q.confidence || null}
                />
              ))}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
