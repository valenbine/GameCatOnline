import fs from 'node:fs';
import path from 'node:path';
import type { RequestHandler } from 'express';
import multer from 'multer';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const uploadsDir = path.resolve(__dirname, '../../uploads');
const romsDir = path.join(uploadsDir, 'roms');
const coversDir = path.join(uploadsDir, 'covers');
const ROM_FILE_SIZE_LIMIT = 256 * 1024 * 1024;
const COVER_FILE_SIZE_LIMIT = 8 * 1024 * 1024;
const romExtensions = new Set(['.nes', '.fds', '.zip', '.sfc', '.smc', '.fig', '.gba', '.gb', '.gbc', '.md', '.gen', '.smd', '.pce']);
const coverExtensions = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif', '.bmp', '.avif']);

fs.mkdirSync(romsDir, { recursive: true });
fs.mkdirSync(coversDir, { recursive: true });

type UploadTarget = 'rom' | 'cover';

type UploadHttpError = Error & {
  status: number;
};

function createUploadHttpError(status: number, message: string) {
  const error = new Error(message) as UploadHttpError;
  error.status = status;
  return error;
}

function formatFileSizeLabel(limit: number) {
  const sizeInMegabytes = limit / (1024 * 1024);
  return `${sizeInMegabytes} MB`;
}

export function toUploadError(target: UploadTarget, error: unknown, originalName = '') {
  if (error instanceof multer.MulterError && error.code === 'LIMIT_FILE_SIZE') {
    const message = target === 'rom' ? `ROM 文件不能超过 ${formatFileSizeLabel(ROM_FILE_SIZE_LIMIT)}` : `封面文件不能超过 ${formatFileSizeLabel(COVER_FILE_SIZE_LIMIT)}`;
    return createUploadHttpError(413, message);
  }

  if (error instanceof Error && 'status' in error && typeof error.status === 'number') {
    return error as UploadHttpError;
  }

  if (error instanceof Error) {
    return createUploadHttpError(400, error.message || `${target === 'rom' ? 'ROM' : '封面'} 上传失败`);
  }

  const fileLabel = originalName ? `：${originalName}` : '';
  return createUploadHttpError(400, `${target === 'rom' ? 'ROM' : '封面'} 上传失败${fileLabel}`);
}

function ensureAllowedExtension(target: UploadTarget, fileName: string) {
  const extension = path.extname(fileName).toLowerCase();
  const allowedExtensions = target === 'rom' ? romExtensions : coverExtensions;
  if (allowedExtensions.has(extension)) {
    return;
  }

  if (target === 'rom') {
    throw createUploadHttpError(400, 'ROM 文件格式不支持，请上传 NES、ZIP、SFC、GBA、GB、GBC、MD 或 PCE 文件');
  }

  throw createUploadHttpError(400, '封面文件格式不支持，请上传 PNG、JPG、WEBP、GIF、BMP 或 AVIF 图片');
}

function buildStorage(destination: string) {
  return multer.diskStorage({
    destination: (_req, _file, callback) => callback(null, destination),
    filename: (_req, file, callback) => {
      const extension = path.extname(file.originalname);
      const name = path.basename(file.originalname, extension).replace(/[^a-zA-Z0-9-_]/g, '-');
      callback(null, `${Date.now()}-${name}${extension}`);
    },
  });
}

function buildSingleFileUpload(target: UploadTarget, destination: string, fileSizeLimit: number): RequestHandler {
  let currentFileName = '';
  const upload = multer({
    storage: buildStorage(destination),
    limits: { fileSize: fileSizeLimit },
    fileFilter: (_req, file, callback) => {
      currentFileName = file.originalname;
      try {
        ensureAllowedExtension(target, file.originalname);
        callback(null, true);
      } catch (error) {
        callback(error as Error);
      }
    },
  }).single('file');

  return (req, res, next) => {
    currentFileName = '';
    upload(req, res, (error) => {
      if (error) {
        next(toUploadError(target, error, currentFileName));
        return;
      }

      next();
    });
  };
}

export const romUploadSingle = buildSingleFileUpload('rom', romsDir, ROM_FILE_SIZE_LIMIT);
export const coverUploadSingle = buildSingleFileUpload('cover', coversDir, COVER_FILE_SIZE_LIMIT);
