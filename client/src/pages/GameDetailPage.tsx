import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { StartGameLink } from '../components/StartGameLink';
import { fetchGameDetail } from '../services/api';
import type { Game } from '../types/game';

export function GameDetailPage() {
  const { id } = useParams();
  const [game, setGame] = useState<Game | null>(null);
  const [status, setStatus] = useState('正在加载游戏详情...');

  useEffect(() => {
    const gameId = Number(id);
    if (!Number.isInteger(gameId) || gameId < 1) {
      setStatus('缺少游戏标识');
      return;
    }

    fetchGameDetail(gameId)
      .then((result) => {
        setGame(result);
        setStatus('');
      })
      .catch((error) => {
        setStatus(error instanceof Error ? error.message : '加载失败');
      });
  }, [id]);

  return (
    <main className="page narrow">
      <div className="page-top-actions align-left">
        <Link to="/" className="text-link">
          返回首页
        </Link>
      </div>

      <section className="panel">
        <p className="eyebrow">游戏详情</p>
        <div className="detail-header-row">
          <h1>{game?.title ?? `游戏 ${id ?? ''}`}</h1>
          {game ? (
            <StartGameLink gameId={game.id} className="detail-play-button">
              开始游戏
            </StartGameLink>
          ) : null}
        </div>
        <div className="detail-description-card">
          <p className="muted detail-description-text">{status || game?.description || '当前游戏暂无简介。'}</p>
        </div>
        {game?.coverUrl ? <img className="game-cover" src={game.coverUrl} alt={game.title} /> : null}
      </section>
    </main>
  );
}
