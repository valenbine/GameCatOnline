import { useNavigate } from 'react-router-dom';

type StartGameLinkProps = {
  gameId: number;
  className?: string;
  children?: string;
};

export function StartGameLink({ gameId, className, children = '开始游戏' }: StartGameLinkProps) {
  const navigate = useNavigate();

  async function handleStartGame() {
    try {
      if (!document.fullscreenElement) {
        await document.documentElement.requestFullscreen();
      }
    } catch {
      // Browsers can deny fullscreen; still enter the game page.
    }

    navigate(`/play/${gameId}`);
  }

  return (
    <button type="button" className={className} onClick={() => void handleStartGame()}>
      {children}
    </button>
  );
}
