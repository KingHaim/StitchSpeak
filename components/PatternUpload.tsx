
import React, { useCallback, useState } from 'react';
import { UploadIcon } from './icons/UploadIcon';
import { FileIcon } from './icons/FileIcon';
import { CloseIcon } from './icons/CloseIcon';

interface PatternUploadProps {
  onFileSelect: (file: File | null) => void;
  selectedFile: File | null;
  disabled?: boolean;
}

export const PatternUpload: React.FC<PatternUploadProps> = ({ onFileSelect, selectedFile, disabled }) => {
  const [isDragging, setIsDragging] = useState(false);

  const handleFileChange = (files: FileList | null) => {
    if (files && files.length > 0) {
      if (files[0].type === 'application/pdf') {
        onFileSelect(files[0]);
      } else {
        alert('Please select a PDF file.');
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
    <div className="w-full h-[32rem]">
      <input
        type="file"
        id="file-upload"
        className="hidden"
        accept="application/pdf"
        onChange={onFileInputChange}
        disabled={disabled}
      />
      
      {!selectedFile ? (
        <label
          htmlFor="file-upload"
          className={`flex flex-col items-center justify-center w-full h-full border-2 border-dashed rounded-lg cursor-pointer transition-colors duration-200
            ${disabled ? 'bg-slate-100 cursor-not-allowed' : 'bg-rose-50/50 hover:bg-rose-100/50'}
            ${isDragging ? 'border-rose-500 bg-rose-100' : 'border-slate-300'}`}
        >
          <div 
            className="flex flex-col items-center justify-center pt-5 pb-6 w-full h-full"
            onDragOver={onDragOver}
            onDragLeave={onDragLeave}
            onDrop={onDrop}
          >
            <UploadIcon className="w-10 h-10 mb-3 text-slate-400" />
            <p className="mb-2 text-sm text-slate-500">
              <span className="font-semibold">Click to upload</span> or drag and drop
            </p>
            <p className="text-xs text-slate-400">PDF only</p>
          </div>
        </label>
      ) : (
        <div className="w-full h-full border border-slate-300 rounded-lg bg-white flex flex-col items-center justify-center p-4">
            <FileIcon className="w-16 h-16 text-rose-500"/>
            <p className="mt-4 text-sm font-medium text-slate-700 break-all">{selectedFile.name}</p>
            <p className="mt-1 text-xs text-slate-500">{(selectedFile.size / 1024).toFixed(2)} KB</p>
            <button 
              onClick={handleRemoveFile}
              disabled={disabled}
              className="mt-4 inline-flex items-center px-3 py-1.5 border border-transparent text-xs font-medium rounded-md shadow-sm text-white bg-rose-500 hover:bg-rose-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-rose-500 disabled:bg-rose-300"
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
