export type Game = {
  id: number;
  title: string;
  slug: string;
  description: string;
  platform: 'nes' | 'arcade' | 'snes' | 'gba' | 'gb' | 'gbc' | 'segaMD' | 'pce';
  coverUrl: string;
  romUrl: string;
  biosUrl: string;
  status: 'draft' | 'published';
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
};
