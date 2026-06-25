
import React, { useCallback, useState } from 'react';
import { UploadIcon } from './icons/UploadIcon';
import { FileIcon } from './icons/FileIcon';
import { CloseIcon } from './icons/CloseIcon';
import { isAcceptedFile } from '../services/fileAnalyzer';

interface PatternUploadProps {
  onFilesSelect: (files: File[]) => void;
  selectedFiles: File[];
  disabled?: boolean;
}

export const PatternUpload: React.FC<PatternUploadProps> = ({ onFilesSelect, selectedFiles, disabled }) => {
  const [isDragging, setIsDragging] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);

  const handleFileChange = useCallback((files: FileList | null) => {
    if (files && files.length > 0) {
      const nextFiles = Array.from(files);
      const invalidFiles = nextFiles.filter((file) => !isAcceptedFile(file));

      if (invalidFiles.length > 0) {
        setFileError('Choose a PDF, DOCX, TXT, or RTF file.');
        return;
      }

      setFileError(null);
      onFilesSelect(nextFiles);
    }
  }, [onFilesSelect]);

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
  }, [disabled, handleFileChange]);

  const onFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    handleFileChange(e.target.files);
    e.target.value = '';
  };
  
  const handleRemoveFile = () => {
    setFileError(null);
    onFilesSelect([]);
  };

  const selectedCount = selectedFiles.length;
  const totalSizeKB = selectedFiles.reduce((sum, file) => sum + file.size / 1024, 0);

  return (
    <div className="w-full">
      <input
        type="file"
        id="file-upload"
        className="hidden"
        accept=".pdf,.docx,.txt,.rtf"
        multiple
        onChange={onFileInputChange}
        disabled={disabled}
      />
      
      {selectedCount === 0 ? (
        <div>
          <label
            htmlFor="file-upload"
            className={`group flex flex-col items-center justify-center w-full min-h-40 sm:min-h-44 rounded-xl border-2 border-dashed px-6 py-8 sm:px-10 sm:py-10 text-center cursor-pointer transition-all duration-200
              ${disabled ? 'bg-brand-100/80 cursor-not-allowed opacity-90' : 'bg-gradient-to-b from-brand-50/40 to-brand-50/80 hover:to-brand-100/60 hover:shadow-md hover:shadow-brand-900/[0.06]'}
              ${fileError ? 'border-error bg-error-container/30' : isDragging ? 'border-brand-600 bg-brand-100 ring-2 ring-brand-200 ring-offset-2 ring-offset-brand-50' : 'border-brand-300'}`}
          >
            <div 
              className="flex flex-col items-center justify-center w-full gap-3"
              onDragOver={onDragOver}
              onDragLeave={onDragLeave}
              onDrop={onDrop}
            >
              <span className={`flex h-11 w-11 items-center justify-center overflow-visible rounded-full transition-colors ${fileError ? 'bg-error-container text-error' : isDragging ? 'bg-brand-200 text-brand-700' : 'bg-brand-100 text-brand-500 group-hover:bg-brand-200 group-hover:text-brand-600'}`}>
                <UploadIcon className="w-6 h-6" />
              </span>
              <div>
                <p className="text-base font-medium text-brand-700">
                  <span className="text-brand-800">Drop files here</span>
                  <span className="text-brand-500"> or </span>
                  <span className="text-brand-600 underline decoration-brand-300 underline-offset-2 group-hover:decoration-brand-500">browse</span>
                </p>
                <p className="mt-2 text-sm text-brand-400">PDF, DOCX, TXT, or RTF</p>
              </div>
            </div>
          </label>
          {fileError && (
            <p className="mt-3 rounded-lg bg-error-container/50 px-3 py-2 text-sm font-medium text-on-error-container" role="alert">
              {fileError}
            </p>
          )}
          </div>
      ) : (
        <div className="w-full min-h-40 sm:min-h-44 rounded-xl border border-brand-200 bg-brand-50/30 flex flex-col items-center justify-center p-6 gap-1">
            <FileIcon className="w-12 h-12 text-brand-600 shrink-0"/>
            <p className="mt-2 text-sm font-medium text-brand-800 break-all text-center max-w-full">
              {selectedCount === 1 ? selectedFiles[0].name : `${selectedCount} patterns selected`}
            </p>
            <p className="text-xs text-brand-400">{totalSizeKB.toFixed(2)} KB total</p>
            {selectedCount > 1 && (
              <ul className="mt-3 max-h-24 w-full max-w-md overflow-y-auto text-xs text-brand-500 space-y-1 text-left">
                {selectedFiles.slice(0, 4).map((file) => (
                  <li key={`${file.name}-${file.size}`} className="truncate">
                    {file.name}
                  </li>
                ))}
                {selectedCount > 4 && <li>+{selectedCount - 4} more</li>}
              </ul>
            )}
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
