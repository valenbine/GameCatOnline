import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { fetchGames } from '../services/api';
import type { Game } from '../types/game';

export function HomePage() {
  const [games, setGames] = useState<Game[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchGames()
      .then((result) => {
        setGames(result);
      })
      .finally(() => {
        setLoading(false);
      });
  }, []);

  return (
    <main className="page">
      <div className="page-top-actions align-right">
        <Link to="/admin" className="text-link">
          管理员后台
        </Link>
      </div>

      <header className="hero">
        <p className="eyebrow">GameCatOnline</p>
        <h1>游戏猫在线游戏</h1>
        <p className="muted">当前是项目骨架版本，已预留前台、游玩页与管理员后台入口。</p>
      </header>

      <section className="panel">
        <div className="panel-header">
          <div>
            <h2>游戏列表</h2>
            <p className="muted panel-subtitle">当前收录 {games.length} 款已上架游戏，支持在线启动与本地存档。</p>
          </div>
        </div>

        <div className="game-list">
          {loading ? <p className="muted">正在加载游戏列表...</p> : null}
          {!loading && games.length === 0 ? <p className="muted">当前还没有已上架游戏。</p> : null}
          {games.map((game) => (
            <article className="card game-row-card" key={game.id}>
              <div className="game-row-media">
                {game.coverUrl ? <img className="game-cover" src={game.coverUrl} alt={game.title} /> : <div className="game-cover game-cover-placeholder">暂无封面</div>}
              </div>
              <div className="game-row-content">
                <div className="game-row-heading">
                  <h3>{game.title}</h3>
                  <span className="game-row-badge">在线可玩</span>
                </div>
                <p className="game-row-description">{game.description || '当前游戏暂无简介。'}</p>
                <div className="game-row-meta">
                  <span className="muted">游戏 ID #{game.id}</span>
                </div>
              </div>
              <div className="game-row-actions">
                <div className="card-actions game-row-buttons">
                  <Link to={`/game/${game.id}`}>查看详情</Link>
                  <Link to={`/play/${game.id}`}>开始游戏</Link>
                </div>
              </div>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
