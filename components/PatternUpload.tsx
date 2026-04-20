
import React, { useCallback, useState } from 'react';
import { UploadIcon } from './icons/UploadIcon';
import { FileIcon } from './icons/FileIcon';
import { CloseIcon } from './icons/CloseIcon';
import { isAcceptedFile } from '../services/fileAnalyzer';

interface PatternUploadProps {
  onFileSelect: (file: File | null) => void;
  selectedFile: File | null;
  disabled?: boolean;
}

export const PatternUpload: React.FC<PatternUploadProps> = ({ onFileSelect, selectedFile, disabled }) => {
  const [isDragging, setIsDragging] = useState(false);

  const handleFileChange = (files: FileList | null) => {
    if (files && files.length > 0) {
      if (isAcceptedFile(files[0])) {
        onFileSelect(files[0]);
      } else {
        alert('Please select a PDF, DOCX, TXT, or RTF file.');
      }
    }
  };

  const onDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (!disabled) setIsDragging(true);
  }, [disabled]);

  const onDragLeave = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const onDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    if (!disabled) {
      handleFileChange(e.dataTransfer.files);
    }
  }, [disabled]);

  const onFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    handleFileChange(e.target.files);
  };
  
  const handleRemoveFile = () => {
    onFileSelect(null);
  };

  return (
    <div className="w-full">
      <input
        type="file"
        id="file-upload"
        className="hidden"
        accept=".pdf,.docx,.txt,.rtf"
        onChange={onFileInputChange}
        disabled={disabled}
      />
      
      {!selectedFile ? (
        <label
          htmlFor="file-upload"
          className={`group flex flex-col items-center justify-center w-full min-h-[18rem] sm:min-h-[20rem] lg:min-h-[22rem] rounded-xl border-2 border-dashed px-6 py-12 sm:px-12 sm:py-14 text-center cursor-pointer transition-all duration-200
            ${disabled ? 'bg-brand-100/80 cursor-not-allowed opacity-90' : 'bg-gradient-to-b from-brand-50/40 to-brand-50/80 hover:to-brand-100/60 hover:shadow-md hover:shadow-brand-900/[0.06]'}
            ${isDragging ? 'border-brand-600 bg-brand-100 ring-2 ring-brand-200 ring-offset-2 ring-offset-brand-50' : 'border-brand-300'}`}
        >
          <div 
            className="flex flex-col items-center justify-center w-full gap-4"
            onDragOver={onDragOver}
            onDragLeave={onDragLeave}
            onDrop={onDrop}
          >
            <span className={`flex h-14 w-14 items-center justify-center overflow-visible rounded-full transition-colors ${isDragging ? 'bg-brand-200 text-brand-700' : 'bg-brand-100 text-brand-500 group-hover:bg-brand-200 group-hover:text-brand-600'}`}>
              <UploadIcon className="w-7 h-7" />
            </span>
            <div>
              <p className="text-base font-medium text-brand-700">
                <span className="text-brand-800">Drop a file here</span>
                <span className="text-brand-500"> or </span>
                <span className="text-brand-600 underline decoration-brand-300 underline-offset-2 group-hover:decoration-brand-500">browse</span>
              </p>
              <p className="mt-2 text-sm text-brand-400">PDF, DOCX, TXT, or RTF</p>
            </div>
          </div>
        </label>
      ) : (
        <div className="w-full min-h-[18rem] sm:min-h-[20rem] lg:min-h-[22rem] rounded-xl border border-brand-200 bg-brand-50/30 flex flex-col items-center justify-center p-8 gap-1">
            <FileIcon className="w-14 h-14 text-brand-600 shrink-0"/>
            <p className="mt-2 text-sm font-medium text-brand-800 break-all text-center max-w-full">{selectedFile.name}</p>
            <p className="text-xs text-brand-400">{(selectedFile.size / 1024).toFixed(2)} KB</p>
            <button 
              onClick={handleRemoveFile}
              disabled={disabled}
              className="mt-4 inline-flex items-center px-3 py-1.5 border border-transparent text-xs font-medium rounded-md shadow-sm text-white bg-brand-600 hover:bg-brand-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-brand-500 disabled:bg-brand-300"
              aria-label="Remove file"
            >
              <CloseIcon className="w-4 h-4 mr-1"/>
              Remove
            </button>
        </div>
      )}
    </div>
  );
};
