import React, { useState, useRef } from 'react';
import { Share, TerminalSquare } from 'lucide-react';

interface UploadZoneProps {
  onUpload: (file: File) => void;
  isOverLimit: boolean;
}

export default function UploadZone({ onUpload }: UploadZoneProps) {
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  };

  const validateAndProcessFile = (file: File) => {
    if (!['video/mp4', 'video/quicktime', 'video/webm'].includes(file.type)) return;
    onUpload(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      validateAndProcessFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      validateAndProcessFile(e.target.files[0]);
    }
  };

  return (
    <div className="w-full max-w-4xl mx-auto flex flex-col items-center">
      <div className="text-center mb-16">
        <h1 className="text-6xl md:text-8xl font-light tracking-tighter text-zinc-100 mb-6">
          Initialize <span className="text-electric-cyan font-serif italic pr-4">Sequence</span>
        </h1>
        <p className="font-mono text-xs tracking-widest uppercase text-zinc-500 max-w-lg mx-auto leading-relaxed">
          Supply raw video metadata for autonomous algorithmic extraction. Target acceptable formats: mp4 // mov // webm.
        </p>
      </div>

      <div
        className={`relative w-full max-w-2xl aspect-[21/9] border border-zinc-800 bg-zinc-900/20 backdrop-blur-sm transition-all duration-700 ease-out cursor-pointer flex flex-col items-center justify-center overflow-hidden group ${
          isDragOver ? 'border-electric-cyan bg-electric-cyan/5 scale-[1.02]' : 'hover:border-zinc-700'
        }`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
      >
        <input type="file" ref={fileInputRef} className="hidden" accept=".mp4,.mov,.webm" onChange={handleFileChange} />
        
        {/* Corner Accents */}
        <div className="absolute top-0 left-0 w-4 h-4 border-t border-l border-white/40 group-hover:border-electric-cyan transition-colors" />
        <div className="absolute top-0 right-0 w-4 h-4 border-t border-r border-white/40 group-hover:border-electric-cyan transition-colors" />
        <div className="absolute bottom-0 left-0 w-4 h-4 border-b border-l border-white/40 group-hover:border-electric-cyan transition-colors" />
        <div className="absolute bottom-0 right-0 w-4 h-4 border-b border-r border-white/40 group-hover:border-electric-cyan transition-colors" />

        <div className="flex flex-col items-center gap-6 z-10 transition-transform duration-500 group-hover:scale-[1.05]">
          <div className="w-16 h-16 border border-zinc-800 rounded-full flex items-center justify-center bg-zinc-950/50 group-hover:border-electric-cyan/50 group-hover:shadow-[0_0_30px_rgba(0,240,255,0.15)] transition-all">
            <Share className="w-6 h-6 text-zinc-400 group-hover:text-electric-cyan transition-colors" strokeWidth={1} />
          </div>
          <span className="font-mono text-xs uppercase tracking-[0.3em] text-zinc-400 group-hover:text-zinc-100 transition-colors">
            {isDragOver ? 'Awaiting Input...' : 'Select File or Drop Here'}
          </span>
        </div>
      </div>

      <div className="w-full max-w-2xl mt-12 grid grid-cols-1 md:grid-cols-3 gap-px bg-zinc-800/50">
        <div className="bg-zinc-950 p-6 flex flex-col gap-4 group hover:bg-zinc-900 transition-colors">
          <TerminalSquare className="w-4 h-4 text-zinc-600 group-hover:text-zinc-300" strokeWidth={1}/>
          <span className="font-mono text-[10px] uppercase tracking-widest text-zinc-500">Stage 01</span>
          <p className="text-sm font-light text-zinc-300">Intelligent frame dissection via purely client-side WASM binaries.</p>
        </div>
        <div className="bg-zinc-950 p-6 flex flex-col gap-4 group hover:bg-zinc-900 transition-colors">
           <TerminalSquare className="w-4 h-4 text-zinc-600 group-hover:text-zinc-300" strokeWidth={1}/>
          <span className="font-mono text-[10px] uppercase tracking-widest text-zinc-500">Stage 02</span>
          <p className="text-sm font-light text-zinc-300">Neural network optical character recognition and string deduplication.</p>
        </div>
        <div className="bg-zinc-950 p-6 flex flex-col gap-4 group hover:bg-zinc-900 transition-colors">
           <TerminalSquare className="w-4 h-4 text-zinc-600 group-hover:text-zinc-300" strokeWidth={1}/>
          <span className="font-mono text-[10px] uppercase tracking-widest text-zinc-500">Stage 03</span>
          <p className="text-sm font-light text-zinc-300">Algorithmic resolution output formatting with step-by-step logic.</p>
        </div>
      </div>
    </div>
  );
}
