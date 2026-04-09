import React from 'react';
import { motion } from 'framer-motion';

interface ProgressTrackerProps {
  steps: {
    id: string;
    label: string;
    status: 'idle' | 'active' | 'completed';
    subtext?: string;
  }[];
}

export default function ProgressTracker({ steps }: ProgressTrackerProps) {
  return (
    <div className="w-full max-w-2xl mx-auto flex flex-col items-center">
      <div className="mb-16 flex items-center gap-4">
        <div className="w-2 h-2 bg-white animate-pulse"></div>
        <h2 className="text-sm font-mono tracking-[0.3em] uppercase text-zinc-300">Executing Analysis Matrix</h2>
        <div className="w-2 h-2 bg-white animate-pulse"></div>
      </div>
      
      <div className="w-full relative py-8 border-t border-b border-zinc-800/50 bg-zinc-900/10">
        <div className="absolute left-[24px] md:left-[39px] top-0 bottom-0 w-px bg-zinc-800/80"></div>
        
        <div className="space-y-12 px-4 md:px-8">
          {steps.map((step, index) => {
            const isActive = step.status === 'active';
            const isCompleted = step.status === 'completed';
            
            return (
              <div key={step.id} className="relative flex items-center gap-8 md:gap-12 group">
                <div className={`relative z-10 w-4 h-4 md:w-5 md:h-5 rounded-full flex items-center justify-center border transition-all duration-700 ${
                  isCompleted ? 'border-electric-cyan bg-electric-cyan/20' : 
                  isActive ? 'border-zinc-300 bg-zinc-300/20' : 'border-zinc-800 bg-zinc-950'
                }`}>
                  {isCompleted && <div className="w-1.5 h-1.5 bg-electric-cyan rounded-full shadow-[0_0_8px_#00F0FF]"></div>}
                  {isActive && <div className="w-1.5 h-1.5 bg-zinc-100 rounded-full animate-ping"></div>}
                </div>
                
                <div className={`flex-1 transition-opacity duration-700 ${step.status === 'idle' ? 'opacity-30' : 'opacity-100'}`}>
                  <div className="flex flex-col md:flex-row md:items-baseline gap-2 md:gap-4 mb-2">
                    <span className="font-mono text-[10px] text-zinc-600 uppercase tracking-widest">
                      SEQ_0{index + 1}
                    </span>
                    <h3 className={`font-mono text-sm uppercase tracking-widest ${isCompleted ? 'text-electric-cyan' : isActive ? 'text-zinc-100' : 'text-zinc-500'}`}>
                      {step.label}
                    </h3>
                  </div>

                  {step.subtext && isActive && (
                    <motion.div 
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      className="mt-4 p-4 border border-zinc-800 bg-black/50 overflow-hidden"
                    >
                      <div className="flex items-center gap-3 font-mono text-xs text-zinc-400">
                        <span className="animate-pulse">_</span>
                        <p>{step.subtext}</p>
                      </div>
                    </motion.div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
