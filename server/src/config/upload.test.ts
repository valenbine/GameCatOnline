import assert from 'node:assert/strict';
import test from 'node:test';
import multer from 'multer';
import { toUploadError } from './upload.js';

test('toUploadError maps ROM size overflow to 413', () => {
  const error = toUploadError('rom', new multer.MulterError('LIMIT_FILE_SIZE'));
  assert.equal(error.status, 413);
  assert.match(error.message, /ROM 文件不能超过 256 MB/);
});

test('toUploadError maps cover size overflow to 413', () => {
  const error = toUploadError('cover', new multer.MulterError('LIMIT_FILE_SIZE'));
  assert.equal(error.status, 413);
  assert.match(error.message, /封面文件不能超过 8 MB/);
});
