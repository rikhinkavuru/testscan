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
      console.error('Processing error:', err);
      setErrorMsg(err.message || String(err) || 'An unexpected error occurred during processing.');
      setAppState('UPLOAD');
    }
  };

  const highConfCount = finalQuestions.filter(q => q.confidence?.toLowerCase() === 'high').length;
  const confidencePercent = finalQuestions.length ? Math.round((highConfCount / finalQuestions.length) * 100) : 0;

  return (
    <div className="min-h-screen bg-transparent font-sans flex flex-col relative w-full">
      {/* Immersive Top Bar */}
      <header className="w-full border-b border-zinc-800/50 bg-zinc-950/80 backdrop-blur-md sticky top-0 z-50">
        <div className="w-full px-8 h-14 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-2 h-2 bg-electric-cyan rounded-none animate-pulse shadow-[0_0_12px_rgba(0,240,255,0.8)]"></div>
            <span className="font-mono text-xs text-zinc-400 tracking-[0.2em] uppercase">SYSTEM // TestScan.OS</span>
          </div>
          {appState === 'RESULTS' && (
            <div className="flex items-center gap-6">
              <button className="hidden sm:flex text-xs font-mono text-zinc-500 hover:text-zinc-300 tracking-wider items-center gap-2 transition-colors uppercase" onClick={() => {
                const text = finalQuestions.map(q => `${q.question_number}. ${q.answer}`).join('\\n');
                navigator.clipboard.writeText(text);
                alert('DATA // Copied to clipboard.');
              }}>
                <Copy className="w-3 h-3" /> [ Copy_Data ]
              </button>
              <button className="text-xs font-mono text-black bg-electric-cyan hover:bg-white tracking-widest items-center gap-2 px-5 py-2 transition-all flex uppercase">
                <Download className="w-3 h-3" /> Export_PDF
              </button>
            </div>
          )}
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 w-full max-w-6xl mx-auto px-4 md:px-8 py-16 flex flex-col relative">
        {appState === 'UPLOAD' && (
          <div className="flex-1 flex items-center justify-center animate-in fade-in duration-1000">
            <div className="w-full">
              {errorMsg && (
                <div className="mb-12 p-1 border-l-2 border-red-500 bg-red-500/10 text-red-400 flex items-start gap-3 max-w-3xl mx-auto backdrop-blur-sm">
                  <div className="px-4 py-3 flex-1 font-mono text-xs tracking-wider uppercase">
                    [ERR_CRITICAL]: {errorMsg}
                  </div>
                  <button onClick={() => setErrorMsg(null)} className="px-4 py-3 text-[10px] font-mono tracking-widest hover:text-white transition-colors">DIMISS</button>
                </div>
              )}
              <UploadZone onUpload={handleUpload} isOverLimit={false} />
            </div>
          </div>
        )}

        {appState === 'PROCESSING' && (
          <div className="flex-1 flex items-center justify-center w-full">
            <ProgressTracker steps={steps} />
          </div>
        )}

        {appState === 'RESULTS' && (
          <div className="w-full space-y-12 animate-in fade-in duration-1000 ease-out">
            {/* Spec-Sheet Summary Card */}
            <div className="w-full border border-zinc-800 bg-zinc-900/20 backdrop-blur-sm p-8 grid grid-cols-1 md:grid-cols-3 gap-8 divide-y md:divide-y-0 md:divide-x divide-zinc-800">
              <div className="flex flex-col">
                <span className="text-[10px] font-mono tracking-[0.2em] text-zinc-500 uppercase mb-2">Metadata // Total Captured</span>
                <span className="text-5xl font-light text-zinc-100 font-mono">{finalQuestions.length}</span>
              </div>
              <div className="flex flex-col md:px-8">
                <span className="text-[10px] font-mono tracking-[0.2em] text-zinc-500 uppercase mb-2">Classification // Domain</span>
                <div className="text-3xl font-light text-electric-cyan lowercase mt-1">
                  [{subject}]
                </div>
              </div>
              <div className="flex flex-col md:px-8">
                <span className="text-[10px] font-mono tracking-[0.2em] text-zinc-500 uppercase mb-2">Validation // Confidence Index</span>
                <span className="text-5xl font-light text-zinc-100 font-mono flex items-baseline">
                  {confidencePercent}<span className="text-2xl text-zinc-600">%</span>
                </span>
              </div>
            </div>

            {/* Questions Grid */}
            <div className="w-full space-y-16">
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
