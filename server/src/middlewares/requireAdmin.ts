import type { Request, Response, NextFunction } from 'express';

export const ADMIN_COOKIE_NAME = 'fc_admin_session';

export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (req.cookies[ADMIN_COOKIE_NAME] !== 'active') {
    res.status(401).json({ success: false, message: '管理员未登录' });
    return;
  }

  next();
}
