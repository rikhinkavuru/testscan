import React from 'react';
import { motion } from 'framer-motion';
import { CheckCircle2, CircleDashed, Loader2 } from 'lucide-react';

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
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8 max-w-xl w-full mx-auto">
      <h2 className="text-2xl font-bold text-gray-900 mb-8 text-center">Processing Test...</h2>
      
      <div className="space-y-6">
        {steps.map((step, index) => {
          const isActive = step.status === 'active';
          const isCompleted = step.status === 'completed';
          
          return (
            <div key={step.id} className={`flex items-start gap-4 transition-opacity duration-300 ${step.status === 'idle' ? 'opacity-40' : 'opacity-100'}`}>
              <div className="mt-0.5 shrink-0">
                {isCompleted ? (
                  <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} className="text-green-500">
                    <CheckCircle2 className="w-6 h-6" />
                  </motion.div>
                ) : isActive ? (
                  <Loader2 className="w-6 h-6 text-indigo-600 animate-spin" />
                ) : (
                  <CircleDashed className="w-6 h-6 text-gray-300" />
                )}
              </div>
              <div>
                <h3 className={`font-semibold text-lg ${isActive ? 'text-indigo-900' : 'text-gray-700'}`}>
                  {step.label}
                </h3>
                {step.subtext && isActive && (
                  <p className="text-sm text-gray-500 mt-1">{step.subtext}</p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
