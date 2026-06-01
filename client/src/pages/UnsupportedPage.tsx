import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

function canEnterLandscapePlayMode() {
  if (typeof window === 'undefined') {
    return false;
  }

  const hasTouch = window.matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 0;
  const smallViewport = window.innerWidth < 900;
  const isLandscape = window.matchMedia('(orientation: landscape)').matches;

  return hasTouch && smallViewport && isLandscape;
}

export function UnsupportedPage() {
  const [, setCanEnter] = useState(() => canEnterLandscapePlayMode());

  useEffect(() => {
    const updateCanEnterState = () => {
      setCanEnter(canEnterLandscapePlayMode());
    };

    window.addEventListener('resize', updateCanEnterState);
    window.addEventListener('orientationchange', updateCanEnterState);

    return () => {
      window.removeEventListener('resize', updateCanEnterState);
      window.removeEventListener('orientationchange', updateCanEnterState);
    };
  }, []);

  return (
    <main className="page narrow">
      <section className="panel">
        <p className="eyebrow">移动端提示</p>
        <h1>当前版本优先支持 PC 键盘</h1>
        <p className="muted">移动端适配和虚拟按键已移除，请在电脑端打开以获得完整游玩体验。</p>
        <Link to="/">返回首页</Link>
      </section>
    </main>
  );
}
