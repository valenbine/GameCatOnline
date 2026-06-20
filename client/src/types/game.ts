export type Game = {
  id: number;
  title: string;
  slug: string;
  description: string;
  controlsHelp: string;
  platform: 'nes' | 'arcade' | 'mame' | 'cps1' | 'cps2' | 'snes' | 'gba' | 'gb' | 'gbc' | 'segaMD' | 'pce';
  coverUrl: string;
  coverCaptureScore: number;
  coverCaptureStatus: 'unknown' | 'auto-ok' | 'needs-review' | 'failed' | 'manual';
  coverCaptureError: string;
  romUrl: string;
  biosUrl: string;
  status: 'draft' | 'published';
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
};
