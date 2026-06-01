import fs from 'node:fs';
import path from 'node:path';
import multer from 'multer';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const uploadsDir = path.resolve(__dirname, '../../uploads');
const romsDir = path.join(uploadsDir, 'roms');
const coversDir = path.join(uploadsDir, 'covers');

fs.mkdirSync(romsDir, { recursive: true });
fs.mkdirSync(coversDir, { recursive: true });

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

export const romUpload = multer({ storage: buildStorage(romsDir) });
export const coverUpload = multer({ storage: buildStorage(coversDir) });
