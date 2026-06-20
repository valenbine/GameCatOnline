import { Router } from 'express';
import { findPublishedGameById, listPublishedGames, serializeGame, serializeGames } from '../services/gameRepository.js';

export const gamesRouter = Router();

const pageSizes = new Set([10, 20, 50, 100]);
type PublicSortMode = 'updated-desc' | 'sort-desc' | 'title-asc';

function getPaginationQuery(query: Record<string, unknown>) {
  const page = Number(query.page ?? 1);
  const requestedPageSize = Number(query.pageSize ?? 10);
  const sort: PublicSortMode = query.sort === 'sort-desc' || query.sort === 'title-asc' ? query.sort : 'updated-desc';
  return {
    page: Number.isInteger(page) && page > 0 ? page : 1,
    pageSize: pageSizes.has(requestedPageSize) ? requestedPageSize : 10,
    search: typeof query.search === 'string' ? query.search : '',
    featuredOnly: query.featured === '1',
    sort,
  };
}

gamesRouter.get('/', (req, res) => {
  const result = listPublishedGames(getPaginationQuery(req.query));
  res.json({
    success: true,
    data: {
      items: serializeGames(result.items),
      total: result.total,
      page: result.page,
      pageSize: result.pageSize,
      totalPages: result.totalPages,
    },
  });
});

gamesRouter.get('/:id', (req, res) => {
  const gameId = Number(req.params.id);
  if (!Number.isInteger(gameId) || gameId < 1) {
    res.status(400).json({ success: false, message: '游戏标识无效' });
    return;
  }

  const game = findPublishedGameById(gameId);

  if (!game) {
    res.status(404).json({ success: false, message: '游戏不存在' });
    return;
  }

  res.json({ success: true, data: serializeGame(game) });
});
