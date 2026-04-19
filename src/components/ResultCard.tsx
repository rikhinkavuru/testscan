import React, { useState } from 'react';
import Image, { type ImageLoaderProps } from 'next/image';

interface ResultCardProps {
  questionNumber: number;
  thumbnailUrl: string | null;
  rawText: string;
  answer: string | null;
  explanation: string | null;
  confidence: string | null;
}

const passthroughImageLoader = ({ src }: ImageLoaderProps) => src;

export default function ResultCard({
  questionNumber,
  thumbnailUrl,
  rawText,
  answer,
  explanation,
  confidence
}: ResultCardProps) {
  const [expanded, setExpanded] = useState(false);

  const confidenceState = confidence?.toLowerCase() || 'low';
  
  const statusColor = 
    confidenceState === 'high' ? 'text-electric-cyan bg-electric-cyan/10' :
    confidenceState === 'medium' ? 'text-orange-400 bg-orange-400/10' :
    'text-red-500 bg-red-500/10';

  return (
    <div className={`w-full border border-zinc-800 bg-zinc-950 flex flex-col md:flex-row relative group hover:border-zinc-700 transition-colors`}>
      {/* Schematic Top Hat Bar (Mobile) / Side Bar (Desktop) */}
      <div className="md:w-16 shrink-0 bg-black border-b md:border-b-0 md:border-r border-zinc-800 flex md:flex-col items-center justify-between p-4 z-10 relative">
        <span className="font-mono text-sm text-zinc-500 tracking-widest">[ {String(questionNumber).padStart(2, '0')} ]</span>
        <div className="w-1 h-1 md:w-full md:h-1 bg-zinc-800"></div>
      </div>

      <div className="flex-1 p-6 md:p-8 flex flex-col md:flex-row gap-8 lg:gap-12 min-w-0">
        
        {/* Visual Spec */}
        <div className="w-full md:w-64 shrink-0 flex flex-col gap-3">
           <div className="flex items-center justify-between">
              <span className="font-mono text-[10px] text-zinc-500 uppercase tracking-widest">Visual Input</span>
              <span className={`font-mono text-[9px] uppercase tracking-widest px-2 py-0.5 border border-current ${statusColor}`}>
                {confidenceState} CONFIDENCE
              </span>
           </div>
          {thumbnailUrl ? (
            <div className="relative border border-zinc-800 bg-black aspect-video p-1 group-hover:border-zinc-700 transition-colors">
                <Image
                  loader={passthroughImageLoader}
                  unoptimized
                  src={thumbnailUrl}
                  alt={`Question ${questionNumber}`}
                  fill
                  sizes="(max-width: 768px) 100vw, 256px"
                  className="object-cover filter grayscale hover:grayscale-0 transition-all duration-500"
                />
                <div className="absolute top-0 right-0 w-2 h-2 border-t border-r border-white/20"></div>
            </div>
          ) : (
            <div className="w-full aspect-video bg-zinc-900 border border-zinc-800 border-dashed flex items-center justify-center p-4">
              <span className="font-mono text-[10px] uppercase text-zinc-600 tracking-widest">No Image Asset</span>
            </div>
          )}
        </div>

        {/* Data Stream */}
        <div className="flex-1 flex flex-col min-w-0">
           <div className="mb-8">
              <h4 className="font-mono text-[10px] text-zinc-500 uppercase tracking-[0.2em] mb-3 flex items-center gap-2">
                <span className="w-1.5 h-1.5 bg-zinc-700 block"></span> Detected Parameters
              </h4>
              <p className="text-zinc-300 font-light text-sm md:text-base leading-relaxed break-words pl-3 border-l px-2 border-zinc-800 line-clamp-4">
                {rawText || '[ SILENT READ // Parsing Error ]'}
              </p>
           </div>
           
           <div className="mb-6 flex-1">
              <h4 className="font-mono text-[10px] text-zinc-500 uppercase tracking-[0.2em] mb-3 flex items-center gap-2">
                 <span className="w-1.5 h-1.5 bg-electric-cyan block"></span> Generated Output
              </h4>
              {answer ? (
                <div className="text-zinc-100 font-medium text-lg md:text-2xl mt-1 tracking-tight">
                  <span className="text-electric-cyan opacity-50 mr-2 font-mono">=&gt;</span>{answer}
                </div>
              ) : (
                <div className="text-red-500 font-mono text-sm tracking-widest uppercase mt-2">
                  [ System Failure // Null Return ]
                </div>
              )}
           </div>

           {explanation && (
             <div className="mt-auto border-t border-zinc-800/50 pt-4">
               <button 
                 onClick={() => setExpanded(!expanded)}
                 className="w-full text-left flex items-center justify-between group/btn"
               >
                 <span className="font-mono text-[10px] uppercase tracking-widest text-zinc-500 group-hover/btn:text-zinc-300 transition-colors">
                   Toggle Internal Resolution Matrix
                 </span>
                 <span className="font-mono text-xs text-zinc-600 group-hover/btn:text-electric-cyan">
                   {expanded ? '[-]' : '[+]'}
                 </span>
               </button>
               
               {expanded && (
                 <div className="mt-6 p-6 border border-zinc-800 bg-black font-mono text-xs text-zinc-400 leading-relaxed whitespace-pre-wrap">
                   {explanation}
                 </div>
               )}
             </div>
           )}
        </div>
      </div>
    </div>
  );
}
