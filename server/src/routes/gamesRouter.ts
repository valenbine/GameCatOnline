import { Router } from 'express';
import { findPublishedGameById, listPublishedGames, serializeGame, serializeGames } from '../services/gameRepository.js';

export const gamesRouter = Router();

gamesRouter.get('/', (_req, res) => {
  res.json({ success: true, data: serializeGames(listPublishedGames()) });
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
