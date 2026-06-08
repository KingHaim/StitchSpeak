import multer from 'multer';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype === 'application/pdf') {
      cb(null, true);
    } else {
      cb(new Error('Only PDF files are allowed.'));
    }
  },
});

export const uploadPdf = upload.single('file');

const TRANSLATABLE_MIME_TYPES = new Set([
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/plain',
  'text/rtf',
  'application/rtf',
]);

const TRANSLATABLE_EXTENSIONS = /\.(pdf|docx?|txt|rtf)$/i;

const translatableUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    // Browsers occasionally send Word/RTF files as application/octet-stream, so
    // accept by extension too.
    const ok =
      TRANSLATABLE_MIME_TYPES.has(file.mimetype) ||
      TRANSLATABLE_EXTENSIONS.test(file.originalname || '');
    if (ok) {
      cb(null, true);
    } else {
      cb(new Error('Unsupported file type. Upload a PDF, Word (.docx), .txt, or .rtf file.'));
    }
  },
});

export const uploadPattern = translatableUpload.single('file');

const ACCEPTED_SOURCE_MIME_TYPES = new Set([
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
]);

const sourceUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (ACCEPTED_SOURCE_MIME_TYPES.has(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Unsupported source file type. Use PDF or Word documents.'));
    }
  },
});

export const uploadPatternSource = sourceUpload.single('file');

const ACCEPTED_THUMB_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
]);

const thumbUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 512 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (ACCEPTED_THUMB_MIME_TYPES.has(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Unsupported thumbnail type. Use JPEG, PNG, or WebP.'));
    }
  },
});

export const uploadPatternThumbnail = thumbUpload.single('file');
