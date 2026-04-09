import React, { useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';

interface ResultCardProps {
  questionNumber: number;
  thumbnailUrl: string | null;
  rawText: string;
  answer: string | null;
  explanation: string | null;
  confidence: string | null;
}

export default function ResultCard({
  questionNumber,
  thumbnailUrl,
  rawText,
  answer,
  explanation,
  confidence
}: ResultCardProps) {
  const [expanded, setExpanded] = useState(false);

  const confidenceColor = 
    confidence?.toLowerCase() === 'high' ? 'bg-green-500' :
    confidence?.toLowerCase() === 'medium' ? 'bg-yellow-400' :
    'bg-red-500';
    
  const borderClass = 
    confidence?.toLowerCase() === 'high' ? 'border-l-green-500' :
    confidence?.toLowerCase() === 'medium' ? 'border-l-yellow-400' :
    'border-l-red-500';

  return (
    <div className={`bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden border-l-[6px] ${borderClass}`}>
      <div className="p-6">
        <div className="flex flex-col md:flex-row gap-6">
          {/* Left: Thumbnail and Number */}
          <div className="w-full md:w-64 shrink-0">
            <div className="flex text-sm font-bold text-gray-500 mb-3 items-center gap-2">
              <span className="w-6 h-6 flex items-center justify-center bg-gray-100 rounded-full text-xs">
                {questionNumber}
              </span>
              QUESTION
            </div>
            {thumbnailUrl ? (
              <img 
                src={thumbnailUrl} 
                alt={`Question ${questionNumber}`}
                className="w-full h-auto rounded-lg border border-gray-200"
              />
            ) : (
              <div className="w-full h-32 bg-gray-50 rounded-lg flex items-center justify-center text-gray-400 text-sm border border-gray-100">
                No Image
              </div>
            )}
          </div>
          
          {/* Right: Content */}
          <div className="flex-1 min-w-0">
            <div className="mb-4">
              <h4 className="text-sm font-semibold text-gray-500 mb-1 uppercase tracking-wider">Detected Text</h4>
              <p className="text-gray-900 font-medium line-clamp-3">{rawText || 'Unreadable text'}</p>
            </div>
            
            <div className="mb-4">
              <h4 className="text-sm font-semibold text-gray-500 mb-1 uppercase tracking-wider">Answer</h4>
              {answer ? (
                <div className="text-xl font-bold text-gray-900 bg-indigo-50/50 p-4 rounded-xl border border-indigo-100 inline-block">
                  {answer}
                </div>
              ) : (
                <div className="text-red-500 font-medium">Failed to solve</div>
              )}
            </div>

            {explanation && (
              <div>
                <button 
                  onClick={() => setExpanded(!expanded)}
                  className="flex items-center gap-2 text-indigo-600 font-semibold text-sm hover:text-indigo-700 transition-colors"
                >
                  {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                  {expanded ? 'Hide Explanation' : 'View Step-by-Step Logic'}
                </button>
                {expanded && (
                  <div className="mt-3 p-4 bg-gray-50 rounded-xl text-gray-700 text-sm leading-relaxed whitespace-pre-wrap border border-gray-100">
                    {explanation}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
