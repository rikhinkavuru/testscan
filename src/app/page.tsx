'use client';

import React, { useState, useEffect } from 'react';
import UploadZone from '@/components/UploadZone';
import ProgressTracker from '@/components/ProgressTracker';
import ResultCard from '@/components/ResultCard';
import { extractAndDeduplicateFrames } from '@/lib/ffmpegService';
import { stringSimilarity, wordOverlapSimilarity } from '@/lib/stringSim';
import { supabase } from '@/lib/supabase';
import { v4 as uuidv4 } from 'uuid';
import { Download, Copy, AlertCircle } from 'lucide-react';
import { createWorker } from 'tesseract.js';

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

interface ExtractedFrame {
  base64: string;
  rawBase64Data: string;
}

export default function Home() {
  const [appState, setAppState] = useState<'UPLOAD' | 'READY' | 'ESTIMATE' | 'PROCESSING' | 'RESULTS'>('UPLOAD');
  const [isOverLimit, setIsOverLimit] = useState(false);
  const [usageCount, setUsageCount] = useState(0);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isLightMode, setIsLightMode] = useState(false);

  const [steps, setSteps] = useState([
    { id: 'extract', label: 'Extracting frames...', status: 'idle' as StepStatus, subtext: '' },
    { id: 'detect', label: 'Detecting questions...', status: 'idle' as StepStatus, subtext: '' },
    { id: 'solve', label: 'Solving questions...', status: 'idle' as StepStatus, subtext: '' },
    { id: 'done', label: 'Done!', status: 'idle' as StepStatus, subtext: '' },
  ]);

  const [finalQuestions, setFinalQuestions] = useState<Question[]>([]);
  const [subject, setSubject] = useState('Unknown');
  const [jobId, setJobId] = useState('');
  
  const [pendingFrames, setPendingFrames] = useState<ExtractedFrame[]>([]);
  const [estimatedCost, setEstimatedCost] = useState(0);

  useEffect(() => {
    const uses = parseInt(localStorage.getItem('testscan_uses') || '0', 10);
    setUsageCount(uses);
  }, []);

  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: light)');
    const syncTheme = () => {
      const nextLight = mediaQuery.matches;
      setIsLightMode(nextLight);
      document.body.classList.toggle('light-mode', nextLight);
    };
    syncTheme();
    mediaQuery.addEventListener('change', syncTheme);
    return () => mediaQuery.removeEventListener('change', syncTheme);
  }, []);

  const updateStep = (id: string, status: StepStatus, subtext?: string) => {
    setSteps(prev => prev.map(s => s.id === id ? { ...s, status, subtext: subtext ?? s.subtext } : s));
  };

  const bumpUsage = () => {
    const newCount = usageCount + 1;
    localStorage.setItem('testscan_uses', newCount.toString());
    setUsageCount(newCount);
  };

  const handleUpload = (file: File) => {
    setSelectedFile(file);
    setPendingFrames([]);
    setEstimatedCost(0);
    setErrorMsg(null);
    setAppState('READY');
  };

  const prepareFrames = async (file: File): Promise<ExtractedFrame[]> => {
    bumpUsage();
    setAppState('PROCESSING');
    setErrorMsg(null);
    setSteps(prev => prev.map(s => ({ ...s, status: 'idle', subtext: '' })));

    try {
      updateStep('extract', 'active');
      const frames = await extractAndDeduplicateFrames(file);

      if (frames.length === 0) {
        throw new Error("No usable frames extracted. Video might be too short or empty.");
      }

      updateStep('extract', 'active', 'Scanning frames locally for meaningful text data...');
      
      const worker = await createWorker('eng');
      const textRichFrames = [];
      
      for (const frame of frames) {
        const ret = await worker.recognize(frame.base64);
        const words = ret.data.text.trim().split(/\s+/).filter(w => w.length > 0);
        if (words.length >= 20) {
          textRichFrames.push(frame);
        }
      }
      await worker.terminate();

      if (textRichFrames.length === 0) {
         throw new Error("No textual data dense enough to process. AI analysis aborted.");
      }

      updateStep('extract', 'completed');
      return textRichFrames;
    } catch (err: any) {
      console.error('Processing error:', err);
      setErrorMsg(err.message || String(err) || 'An unexpected error occurred during processing.');
      setAppState('UPLOAD');
      throw err;
    }
  };

  const seeHowMuchItCosts = async () => {
    if (!selectedFile) return;
    try {
      const frames = await prepareFrames(selectedFile);
      setPendingFrames(frames);
      const estQuestions = frames.length; // assumes ~1 Q per frame
      const cost = (frames.length * 0.001) + (estQuestions * 0.003);
      setEstimatedCost(cost);
      setAppState('ESTIMATE');
    } catch (error) {
      // Error state already set in prepareFrames.
      console.error('Cost estimation failed', error);
    }
  };

  const startNow = async () => {
    if (!selectedFile) return;
    try {
      const frames = await prepareFrames(selectedFile);
      setPendingFrames(frames);
      await confirmAndProcess(frames);
    } catch (error) {
      // Error state already set in prepareFrames.
      console.error('Start flow failed', error);
    }
  };

  const confirmAndProcess = async (framesToProcess?: ExtractedFrame[]) => {
    setAppState('PROCESSING');
    try {
      const workingFrames = framesToProcess ?? pendingFrames;
      updateStep('detect', 'active', `Running AI detection on ${workingFrames.length} meaningful frames...`);
      let allDetected: Question[] = [];
      let noQuestionFrames = 0;

      for (let i = 0; i < workingFrames.length; i++) {
        const frame = workingFrames[i];
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

      if (allDetected.length === 0) {
        throw new Error("Detection failed. Please check video resolution.");
      }

      // Cross-frame deduplication (similarity > 85% word overlap)
      const uniqueFound: Question[] = [];
      for (const q of allDetected) {
        if (!q.question_text || q.question_text.trim().length < 5) continue;
        
        let isDuplicate = false;
        for (let i = 0; i < uniqueFound.length; i++) {
          const uq = uniqueFound[i];
          const sim = wordOverlapSimilarity(q.question_text, uq.raw_text);
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

      uniqueFound.forEach((q, idx) => { q.question_number = idx + 1; });
      updateStep('detect', 'completed');

      updateStep('solve', 'active', `Solving ${uniqueFound.length} unique questions...`);
      for (const q of uniqueFound) {
        try {
          const res = await fetch('/api/solve', {
            method: 'POST',
            body: JSON.stringify({ question_text: q.raw_text, options: q.options }),
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

      updateStep('done', 'active', 'Finalizing output...');
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

      const jId = uuidv4();
      setJobId(jId);

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
    <div className={`min-h-screen bg-transparent font-sans flex flex-col relative w-full ${isLightMode ? 'app-light' : ''}`}>
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

        {appState === 'READY' && selectedFile && (
          <div className="flex-1 flex flex-col items-center justify-center animate-in fade-in duration-700">
            <div className="border border-zinc-800 bg-zinc-900/20 backdrop-blur-sm p-10 max-w-xl w-full text-center">
              <h2 className="font-mono text-sm tracking-[0.3em] uppercase text-zinc-500 mb-6">Upload Ready</h2>
              <p className="text-zinc-300 font-light text-lg mb-2">Loaded file:</p>
              <p className="font-mono text-electric-cyan text-sm break-all">{selectedFile.name}</p>
              <div className="flex flex-col sm:flex-row gap-4 w-full mt-10">
                <button onClick={() => setAppState('UPLOAD')} className="flex-1 px-4 py-3 border border-zinc-800 text-zinc-400 font-mono text-xs hover:bg-zinc-800 hover:text-white transition-colors uppercase tracking-widest">Choose Different File</button>
                <button onClick={seeHowMuchItCosts} className="flex-1 px-4 py-3 border border-electric-cyan/60 text-electric-cyan font-mono font-bold text-xs hover:bg-electric-cyan/10 transition-colors uppercase tracking-widest">See How Much It Costs</button>
                <button onClick={startNow} className="flex-1 px-4 py-3 bg-electric-cyan text-black font-mono font-bold text-xs hover:bg-white transition-colors uppercase tracking-widest">Start</button>
              </div>
            </div>
          </div>
        )}

        {appState === 'ESTIMATE' && (
          <div className="flex-1 flex flex-col items-center justify-center animate-in fade-in duration-1000">
             <div className="border border-zinc-800 bg-zinc-900/20 backdrop-blur-sm p-12 max-w-xl w-full text-center">
                 <h2 className="font-mono text-sm tracking-[0.3em] uppercase text-zinc-500 mb-8">Cost Gateway Authorization</h2>
                 <p className="text-zinc-300 font-light text-lg mb-4">
                    Extracted <span className="text-electric-cyan font-mono">{pendingFrames.length}</span> meaningful frames via local parse.
                 </p>
                 <div className="text-4xl font-mono text-zinc-100 my-8 py-6 border-y border-zinc-800/50 flex flex-col items-center gap-2">
                    <span className="text-[10px] text-zinc-500 tracking-widest uppercase">Estimated Compute Cost</span>
                    ~${estimatedCost.toFixed(3)}
                 </div>
                 <div className="flex gap-4 w-full mt-10">
                    <button onClick={() => setAppState('UPLOAD')} className="flex-1 px-4 py-3 border border-zinc-800 text-zinc-400 font-mono text-xs hover:bg-zinc-800 hover:text-white transition-colors uppercase tracking-widest">Abort</button>
                    <button onClick={confirmAndProcess} className="flex-1 px-4 py-3 bg-electric-cyan text-black font-mono font-bold text-xs hover:bg-white transition-colors uppercase tracking-widest">Authorize & Transmit</button>
                 </div>
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
