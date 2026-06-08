import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { StartGameLink } from '../components/StartGameLink';
import { fetchGames } from '../services/api';
import type { Game } from '../types/game';

export function HomePage() {
  const [games, setGames] = useState<Game[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchKeyword, setSearchKeyword] = useState('');

  useEffect(() => {
    fetchGames()
      .then((result) => {
        setGames(result);
      })
      .finally(() => {
        setLoading(false);
      });
  }, []);

  const filteredGames = games.filter((game) => {
    const keyword = searchKeyword.trim().toLowerCase();
    if (!keyword) {
      return true;
    }

    return game.title.toLowerCase().includes(keyword);
  });

  return (
    <main className="page">
      <div className="page-top-actions align-right">
        <Link to="/admin" className="text-link">
          管理员后台
        </Link>
      </div>

      <header className="hero hero-arcade">
        <div className="hero-copy">
          <p className="eyebrow hero-eyebrow">GameCatOnline</p>
          <h1>
            把怀旧游戏
            <span>装进浏览器</span>
          </h1>
          <p className="hero-lead">打开游戏猫，按下开始回到童年时代。</p>
          <div className="hero-meta-row" aria-label="平台特性">
            <span>FC / NES</span>
            <span>网页即玩</span>
            <span>本地存档</span>
          </div>
          <div className="detail-description-card home-description-card hero-description-card">
            <p className="muted detail-description-text">当前收录 {games.length} 款已上架游戏，支持在线启动、键盘操作、全屏游玩与多槽位本地进度。</p>
          </div>
        </div>

        <div className="hero-visual" aria-hidden="true">
          <div className="hero-orbit hero-orbit-one" />
          <div className="hero-orbit hero-orbit-two" />
          <div className="hero-game-device">
            <div className="hero-mini-crt">
              <span>FC</span>
              <strong>PRESS START</strong>
            </div>
            <div className="retro-controller">
              <div className="controller-grip controller-grip-left" />
              <div className="controller-grip controller-grip-right" />
              <div className="controller-face">
                <div className="controller-dpad">
                  <span />
                  <span />
                </div>
                <div className="controller-center">
                  <span>SELECT</span>
                  <span>START</span>
                </div>
                <div className="controller-buttons">
                  <span>B</span>
                  <span>A</span>
                </div>
              </div>
            </div>
            <div className="arcade-deck">
              <div className="arcade-joystick">
                <span />
              </div>
              <div className="arcade-deck-buttons">
                <span />
                <span />
                <span />
              </div>
            </div>
          </div>
          <div className="hero-cartridge">
            <span>8BIT</span>
            <strong>RETRO</strong>
          </div>
        </div>
      </header>

      <section className="panel">
        <div className="panel-header">
          <div>
            <h2>游戏列表</h2>
            <p className="muted panel-subtitle">当前收录 {games.length} 款已上架游戏，支持在线启动与本地存档。</p>
          </div>
          <label className="home-search-field">
            <span className="home-search-label">搜索游戏</span>
            <input value={searchKeyword} onChange={(event) => setSearchKeyword(event.target.value)} placeholder="按游戏名称搜索" />
          </label>
        </div>

        <div className="game-list">
          {loading ? <p className="muted">正在加载游戏列表...</p> : null}
          {!loading && games.length === 0 ? <p className="muted">当前还没有已上架游戏。</p> : null}
          {!loading && games.length > 0 && filteredGames.length === 0 ? <p className="muted">没有找到匹配的游戏。</p> : null}
          {filteredGames.map((game) => (
            <article className="card game-row-card" key={game.id}>
              <div className="game-row-media">
                {game.coverUrl ? <img className="game-cover" src={game.coverUrl} alt={game.title} /> : <div className="game-cover game-cover-placeholder">暂无封面</div>}
              </div>
              <div className="game-row-content">
                <div className="game-row-heading">
                  <h3>{game.title}</h3>
                  <span className="game-row-badge">在线可玩</span>
                </div>
                <div className="game-row-description-card">
                  <p className="game-row-description">{game.description || '当前游戏暂无简介。'}</p>
                </div>
                <div className="game-row-meta">
                  <span className="muted">游戏 ID #{game.id}</span>
                </div>
              </div>
              <div className="game-row-actions">
                <div className="card-actions game-row-buttons">
                  <Link to={`/game/${game.id}`}>查看详情</Link>
                  <StartGameLink gameId={game.id} />
                </div>
              </div>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
