import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { StartGameLink } from '../components/StartGameLink';
import { fetchGameDetail } from '../services/api';
import type { Game } from '../types/game';

const platformLabels: Record<Game['platform'], string> = {
  arcade: '街机 / FBNeo',
  cps1: '街机 / CPS1',
  cps2: '街机 / CPS2',
  gb: 'GB',
  gba: 'GBA',
  gbc: 'GBC',
  mame: '街机 / MAME 2003 Plus',
  nes: 'FC / NES',
  pce: 'PCE',
  segaMD: 'MD / Genesis',
  snes: 'SFC / SNES',
};

function getPlatformLabel(platform: Game['platform']) {
  return platformLabels[platform];
}

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

      <section className="panel detail-hero-panel">
        <div className="detail-hero-layout">
          <div className="detail-cover-column">
            {game?.coverUrl ? <img className="game-cover detail-hero-cover" src={game.coverUrl} alt={game.title} loading="eager" decoding="async" /> : <div className="game-cover game-cover-placeholder detail-hero-cover">暂无封面</div>}
          </div>
          <div className="detail-copy-column">
            <p className="eyebrow">游戏详情</p>
            <div className="detail-header-row">
              <h1>{game?.title ?? `游戏 ${id ?? ''}`}</h1>
              {game ? (
                <div className="detail-action-row">
                  <StartGameLink gameId={game.id} className="detail-play-button">
                    开始游戏
                  </StartGameLink>
                  <a href="#detail-controls-guide" className="detail-secondary-button">
                    查看操作说明
                  </a>
                </div>
              ) : null}
            </div>
            <div className="detail-meta-row">
              {game ? <span>{getPlatformLabel(game.platform)}</span> : null}
              {game ? <span>游戏 ID #{game.id}</span> : null}
              {game ? <span>更新于 {new Date(game.updatedAt).toLocaleDateString('zh-CN')}</span> : null}
            </div>
            <div className="detail-description-card detail-hero-description">
              <p className="muted detail-description-text">{status || game?.description || '当前游戏暂无简介。'}</p>
            </div>
            <section className="detail-description-card detail-controls-card" id="detail-controls-guide">
              <p className="eyebrow detail-controls-eyebrow">操作说明</p>
              <p className="muted detail-description-text">{game?.controlsHelp || '当前游戏暂未填写单独的操作说明，进入游玩页后可直接查看默认键位。'}</p>
            </section>
            <div className="detail-feature-grid">
              <article className="detail-feature-card">
                <span>启动方式</span>
                <strong>浏览器即玩</strong>
              </article>
              <article className="detail-feature-card">
                <span>游玩模式</span>
                <strong>支持全屏</strong>
              </article>
              <article className="detail-feature-card">
                <span>进度管理</span>
                <strong>本地存档</strong>
              </article>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
