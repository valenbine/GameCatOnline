import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { StartGameLink } from '../components/StartGameLink';
import { fetchGames } from '../services/api';
import type { Game } from '../types/game';

const pageSizeOptions = [10, 20, 50, 100];

const platformLabels: Record<Game['platform'], string> = {
  arcade: '街机精选',
  cps1: 'CPS1 街机',
  cps2: 'CPS2 街机',
  gb: '掌机经典',
  gba: 'GBA 热门',
  gbc: 'GBC 经典',
  mame: 'MAME 街机',
  nes: 'FC 主打',
  pce: 'PCE 小众佳作',
  segaMD: 'MD 热血系列',
  snes: 'SFC 名作',
};

function getPlatformLabel(platform: Game['platform']) {
  return platformLabels[platform];
}

export function HomePage() {
  const [games, setGames] = useState<Game[]>([]);
  const [featuredGames, setFeaturedGames] = useState<Game[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchKeyword, setSearchKeyword] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [totalGames, setTotalGames] = useState(0);
  const [totalPages, setTotalPages] = useState(1);

  useEffect(() => {
    setLoading(true);
    fetchGames({ page, pageSize, search: searchKeyword.trim() })
      .then((result) => {
        setGames(result.items);
        setTotalGames(result.total);
        setTotalPages(result.totalPages);
        setPage(result.page);
      })
      .finally(() => {
        setLoading(false);
      });
  }, [page, pageSize, searchKeyword]);

  useEffect(() => {
    fetchGames({ page: 1, pageSize: 10, sort: 'sort-desc', featured: true })
      .then((result) => {
        setFeaturedGames(result.items.slice(0, 3));
      })
      .catch(() => {
        setFeaturedGames([]);
      });
  }, []);

  const firstItem = totalGames === 0 ? 0 : (page - 1) * pageSize + 1;
  const lastItem = Math.min(page * pageSize, totalGames);
  const heroGame = featuredGames[0] ?? null;
  const supportPlatforms = Object.keys(platformLabels).length;

  return (
    <main className="page">
      <div className="page-top-actions align-right">
        <Link to="/admin" className="text-link">
          管理员后台
        </Link>
      </div>

      <header className="hero hero-arcade hero-premium">
        <div className="hero-copy">
          <p className="eyebrow hero-eyebrow">GameCatOnline</p>
          <h1>
            经典游戏
            <span>直接开玩</span>
          </h1>
          <p className="hero-lead">从 FC 到街机，打开页面就能回到熟悉的像素战场。</p>
          <div className="hero-meta-row" aria-label="平台特性">
            <span>{totalGames} 款游戏</span>
            <span>{supportPlatforms} 类平台</span>
            <span>在线可玩</span>
            <span>立即开机</span>
          </div>
          <div className="hero-action-row">
            {heroGame ? <StartGameLink gameId={heroGame.id}>立即开机</StartGameLink> : null}
            <a href="#game-library" className="text-link hero-secondary-link">
              浏览游戏列表
            </a>
          </div>
          <div className="hero-stats-grid" aria-label="站点概览">
            <article className="hero-stat-card">
              <span>馆藏规模</span>
              <strong>{totalGames}</strong>
              <p>按平台与封面整理好的在线游戏目录，随时可以挑一款开始。</p>
            </article>
            <article className="hero-stat-card">
              <span>游玩方式</span>
              <strong>开机即玩</strong>
              <p>支持全屏、键盘操作和本地存档，打开页面就能进入状态。</p>
            </article>
             <article className="hero-stat-card">
               <span>今日推荐</span>
               <strong>{heroGame?.title ?? '等待新作入馆'}</strong>
               <p>{heroGame ? getPlatformLabel(heroGame.platform) : '置顶一款游戏后会在这里显示。'}</p>
             </article>
          </div>
        </div>

        <div className="hero-visual" aria-hidden="true">
          <div className="hero-display-shell">
            <div className="hero-display-frame">
              {heroGame?.coverUrl ? (
                <img src={heroGame.coverUrl} alt={heroGame.title} className="hero-display-cover" loading="eager" decoding="async" fetchPriority="high" />
              ) : (
                <div className="hero-display-placeholder">CURATED</div>
              )}
            </div>
            <div className="hero-display-caption">
              <span>Featured Game</span>
              <strong>{heroGame?.title ?? 'GameCat Selection'}</strong>
            </div>
          </div>
          <div className="hero-floating-cards">
            {featuredGames.map((game, index) => (
              <article className={`hero-floating-card hero-floating-card-${index + 1}`} key={game.id}>
                <span>{getPlatformLabel(game.platform)}</span>
                <strong>{game.title}</strong>
              </article>
            ))}
          </div>
        </div>
      </header>

      {featuredGames.length > 0 ? (
        <section className="collection-strip panel">
          <div className="collection-strip-header">
            <div>
              <h2>本期精选</h2>
              <p className="muted panel-subtitle">后台最新置顶的 3 款游戏会自动进入这里，最后一次置顶的那一款同时作为首页 Hero 主推。</p>
            </div>
            <span className="collection-strip-note">当前页面展示 {games.length} 款</span>
          </div>
          <div className="collection-spotlight-grid">
            {featuredGames.map((game) => (
              <article className="collection-spotlight-card" key={game.id}>
                <div className="collection-spotlight-media">
                  {game.coverUrl ? <img className="game-cover" src={game.coverUrl} alt={game.title} loading="eager" decoding="async" /> : <div className="game-cover game-cover-placeholder">暂无封面</div>}
                </div>
                <div className="collection-spotlight-content">
                  <span>{getPlatformLabel(game.platform)}</span>
                  <h3>{game.title}</h3>
                  <p>{game.description || '当前简介暂缺，建议直接进入详情页查看封面与游玩状态。'}</p>
                  <div className="collection-spotlight-actions">
                    <Link to={`/game/${game.id}`}>查看详情</Link>
                    <StartGameLink gameId={game.id}>开始游戏</StartGameLink>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </section>
      ) : null}

      <section className="panel library-panel" id="game-library">
        <div className="panel-header">
          <div>
            <h2>游戏列表</h2>
            <p className="muted panel-subtitle">按名称检索全部公开游戏，快速挑出今天想开机的那一款。</p>
          </div>
          <label className="home-search-field">
            <span className="home-search-label">搜索游戏</span>
            <input
              value={searchKeyword}
              onChange={(event) => {
                setSearchKeyword(event.target.value);
                setPage(1);
              }}
              placeholder="按游戏名称搜索"
            />
          </label>
        </div>

        <div className="pagination-bar">
          <span className="muted">
            当前显示 {firstItem}-{lastItem} / {totalGames} 款游戏
          </span>
          <div className="pagination-controls">
            <label>
              每页
              <select
                value={pageSize}
                onChange={(event) => {
                  setPageSize(Number(event.target.value));
                  setPage(1);
                }}
              >
                {pageSizeOptions.map((option) => (
                  <option value={option} key={option}>
                    {option}
                  </option>
                ))}
              </select>
            </label>
            <button type="button" onClick={() => setPage((current) => Math.max(1, current - 1))} disabled={page <= 1 || loading}>
              上一页
            </button>
            <span className="muted">
              {page} / {totalPages}
            </span>
            <button type="button" onClick={() => setPage((current) => Math.min(totalPages, current + 1))} disabled={page >= totalPages || loading}>
              下一页
            </button>
          </div>
        </div>

        <div className="game-list">
          {loading ? <p className="muted">正在加载游戏列表...</p> : null}
          {!loading && totalGames === 0 && !searchKeyword.trim() ? <p className="muted">当前还没有已上架游戏。</p> : null}
          {!loading && totalGames === 0 && searchKeyword.trim() ? <p className="muted">没有找到匹配的游戏。</p> : null}
          {games.map((game) => (
            <article className="card game-row-card" key={game.id}>
              <div className="game-row-media">
                {game.coverUrl ? <img className="game-cover" src={game.coverUrl} alt={game.title} loading="lazy" decoding="async" /> : <div className="game-cover game-cover-placeholder">暂无封面</div>}
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
                  <StartGameLink gameId={game.id}>开始游戏</StartGameLink>
                </div>
              </div>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
