import { useEffect, useState } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { EmulatorPlayer } from '../modules/emulator/EmulatorPlayer';
import { fetchGameDetail } from '../services/api';
import type { Game } from '../types/game';

function shouldRedirectToUnsupported() {
  if (typeof window === 'undefined') {
    return false;
  }

  const hasTouch = window.matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 0;
  const smallViewport = window.innerWidth < 900;

  return hasTouch && smallViewport;
}

export function PlayPage() {
  const { id } = useParams();
  const [game, setGame] = useState<Game | null>(null);
  const [status, setStatus] = useState('正在准备游戏...');
  const [unsupported, setUnsupported] = useState(() => shouldRedirectToUnsupported());

  useEffect(() => {
    const updateUnsupportedState = () => {
      setUnsupported(shouldRedirectToUnsupported());
    };

    window.addEventListener('resize', updateUnsupportedState);
    window.addEventListener('orientationchange', updateUnsupportedState);

    return () => {
      window.removeEventListener('resize', updateUnsupportedState);
      window.removeEventListener('orientationchange', updateUnsupportedState);
    };
  }, []);

  if (unsupported) {
    return <Navigate to="/unsupported" replace />;
  }

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
        setStatus(error instanceof Error ? error.message : '加载游戏失败');
      });
  }, [id]);

  return (
    <main className="page">
      {game ? (
        <EmulatorPlayer game={game} />
      ) : (
        <section className="panel play-loading-panel">
          <p className="eyebrow">正在装载馆藏</p>
          <h1>请稍等，游戏正在接入展厅画面</h1>
          <p className="muted">{status}</p>
          <Link to="/" className="text-link play-loading-link">
            返回首页
          </Link>
        </section>
      )}
    </main>
  );
}
