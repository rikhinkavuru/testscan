import React, { useState, useRef } from 'react';
import { UploadCloud, FileVideo, AlertCircle } from 'lucide-react';

interface UploadZoneProps {
  onUpload: (file: File) => void;
  isOverLimit: boolean;
}

export default function UploadZone({ onUpload, isOverLimit }: UploadZoneProps) {
  const [isDragOver, setIsDragOver] = useState(false);
  const [error, setError] = useState<string | null>(null);
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
    setError(null);
    if (!['video/mp4', 'video/quicktime', 'video/webm'].includes(file.type)) {
      setError('Please upload a valid .mp4, .mov, or .webm file.');
      return;
    }
    if (file.size > 500 * 1024 * 1024) {
      setError('File size exceeds 500MB limit.');
      return;
    }
    onUpload(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    
    if (isOverLimit) return;
    
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      validateAndProcessFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (isOverLimit) return;
    
    if (e.target.files && e.target.files.length > 0) {
      validateAndProcessFile(e.target.files[0]);
    }
  };

  if (isOverLimit) {
    return (
      <div className="bg-white p-8 rounded-2xl shadow-sm border border-gray-100 max-w-xl w-full mx-auto text-center">
        <AlertCircle className="w-16 h-16 text-red-500 mx-auto mb-4" />
        <h2 className="text-2xl font-bold text-gray-900 mb-2">Usage Limit Reached</h2>
        <p className="text-gray-600 mb-6">You've used your 3 free analyses. Upgrade to continue.</p>
        <button className="bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-3 px-8 rounded-lg transition-colors">
          Upgrade Plan
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-2xl w-full mx-auto">
      <div
        className={`relative border-2 border-dashed rounded-3xl p-12 text-center transition-all cursor-pointer ${
          isDragOver ? 'border-indigo-600 bg-indigo-50/50 scale-[1.02]' : 'border-gray-300 hover:border-indigo-400 hover:bg-gray-50'
        }`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
      >
        <input
          type="file"
          ref={fileInputRef}
          className="hidden"
          accept=".mp4,.mov,.webm,video/mp4,video/quicktime,video/webm"
          onChange={handleFileChange}
        />
        
        <div className="mx-auto w-20 h-20 bg-indigo-100 rounded-full flex items-center justify-center mb-6">
          <UploadCloud className="w-10 h-10 text-indigo-600" />
        </div>
        
        <h2 className="text-2xl font-bold text-gray-900 mb-2">Upload your test recording</h2>
        <p className="text-gray-500 mb-8 max-w-md mx-auto">
          Drag and drop an .mp4, .mov, or .webm file up to 500MB, or click to browse.
        </p>
        
        {error && (
          <div className="mb-6 p-4 bg-red-50 text-red-700 rounded-lg flex items-center gap-2 max-w-md mx-auto">
            <AlertCircle className="w-5 h-5 shrink-0" />
            <span className="text-sm">{error}</span>
          </div>
        )}

        <button className="bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-3 px-8 rounded-full shadow-lg shadow-indigo-600/20 transition-all active:scale-95 inline-flex items-center gap-2">
          Analyze My Test <span className="text-lg leading-none shrink-0">↗</span>
        </button>
      </div>

      <div className="mt-12 grid grid-cols-3 gap-6 text-center px-4">
        <div>
          <div className="w-12 h-12 bg-white rounded-xl flex items-center justify-center shadow-sm mx-auto mb-4 text-indigo-600 font-bold">1</div>
          <h3 className="font-semibold text-gray-900 mb-1">Upload video</h3>
          <p className="text-sm text-gray-500">Record yourself scrolling through the exam</p>
        </div>
        <div>
          <div className="w-12 h-12 bg-white rounded-xl flex items-center justify-center shadow-sm mx-auto mb-4 text-indigo-600 font-bold">2</div>
          <h3 className="font-semibold text-gray-900 mb-1">AI scans frames</h3>
          <p className="text-sm text-gray-500">We detect and deduplicate questions</p>
        </div>
        <div>
          <div className="w-12 h-12 bg-white rounded-xl flex items-center justify-center shadow-sm mx-auto mb-4 text-indigo-600 font-bold">3</div>
          <h3 className="font-semibold text-gray-900 mb-1">Get your answers</h3>
          <p className="text-sm text-gray-500">Step-by-step solutions instantly</p>
        </div>
      </div>
    </div>
  );
}
