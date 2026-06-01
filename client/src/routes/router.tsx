import { createBrowserRouter } from 'react-router-dom';
import { AdminLoginPage } from '../pages/AdminLoginPage';
import { AdminPage } from '../pages/AdminPage';
import { GameDetailPage } from '../pages/GameDetailPage';
import { HomePage } from '../pages/HomePage';
import { PlayPage } from '../pages/PlayPage';
import { UnsupportedPage } from '../pages/UnsupportedPage';

export const router = createBrowserRouter([
  {
    path: '/',
    element: <HomePage />,
  },
  {
    path: '/game/:id',
    element: <GameDetailPage />,
  },
  {
    path: '/play/:id',
    element: <PlayPage />,
  },
  {
    path: '/unsupported',
    element: <UnsupportedPage />,
  },
  {
    path: '/admin/login',
    element: <AdminLoginPage />,
  },
  {
    path: '/admin',
    element: <AdminPage />,
  },
]);
