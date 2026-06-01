export type Game = {
  id: number;
  title: string;
  slug: string;
  description: string;
  coverUrl: string;
  romUrl: string;
  status: 'draft' | 'published';
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
};
