import { Request, Response, NextFunction } from 'express';
import { supabaseAdmin } from '../config/supabase';
import prisma from '../config/database';
import { config } from '../config';

export interface AuthenticatedUser {
  id: string;
  email: string;
  fullName: string;
  role: 'admin' | 'worker';
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
    }
  }
}

export const SHARED_TERMINAL_ID = '00000000-0000-0000-0000-000000000001';
export const SHARED_TERMINAL_EMAIL = 'terminal@internal.mdms';
export const SHARED_TERMINAL_NAME = 'Shared Factory Terminal';

let cachedTerminalUser: AuthenticatedUser | null = null;

/**
 * Retrieve or automatically create the Shared Terminal user record.
 * This represents honest, non-attributable shop-floor terminal activity.
 */
export async function getSharedTerminalUser(): Promise<AuthenticatedUser> {
  if (cachedTerminalUser) return cachedTerminalUser;

  let terminalUser = await prisma.user.findFirst({
    where: {
      OR: [
        { id: SHARED_TERMINAL_ID },
        { email: SHARED_TERMINAL_EMAIL },
      ],
    },
  });

  if (!terminalUser) {
    terminalUser = await prisma.user.create({
      data: {
        id: SHARED_TERMINAL_ID,
        email: SHARED_TERMINAL_EMAIL,
        fullName: SHARED_TERMINAL_NAME,
        role: 'worker',
      },
    });
  }

  cachedTerminalUser = {
    id: terminalUser.id,
    email: terminalUser.email,
    fullName: terminalUser.fullName,
    role: terminalUser.role as 'admin' | 'worker',
  };

  return cachedTerminalUser;
}

/**
 * Primary Authentication Middleware for Shared Factory Terminal.
 *
 * In the Shared Factory Terminal architecture, all access within the company's
 * private network / approved VPN operates under the verified Shared Factory Terminal identity.
 * Optional Bearer JWT is supported for legacy/scripted integrations.
 */
export async function authenticate(req: Request, res: Response, next: NextFunction) {
  try {
    // 1. Check for optional Bearer JWT if provided
    const authHeader = req.headers.authorization;
    if (authHeader?.startsWith('Bearer ')) {
      const token = authHeader.substring(7);
      if (token && token !== 'undefined' && token !== 'null') {
        try {
          const { data: { user: supaUser }, error } = await supabaseAdmin.auth.getUser(token);
          if (!error && supaUser) {
            let dbUser = await prisma.user.findUnique({ where: { id: supaUser.id } });
            if (!dbUser) {
              dbUser = await prisma.user.create({
                data: {
                  id: supaUser.id,
                  email: supaUser.email || '',
                  fullName: supaUser.user_metadata?.full_name || supaUser.email?.split('@')[0] || 'User',
                  role: 'worker',
                },
              });
            }

            req.user = {
              id: dbUser.id,
              email: dbUser.email,
              fullName: dbUser.fullName,
              role: dbUser.role as 'admin' | 'worker',
            };
            return next();
          }
        } catch {
          // Fall through to shared terminal mode
        }
      }
    }

    // 2. Shared Factory Terminal Mode (Default for all connected company users)
    req.user = await getSharedTerminalUser();
    return next();
  } catch (err) {
    console.error('Auth middleware error:', err);
    return res.status(500).json({ error: 'Authentication failed' });
  }
}

/**
 * Access Control for Shared Factory Terminal.
 * In shared terminal mode, all network-connected operators possess full functionality.
 */
export function requireRole(...roles: ('admin' | 'worker')[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Not authenticated' });
    }
    // In Shared Factory Terminal mode, all connected network users have complete access
    if (config.auth.noLoginMode) {
      return next();
    }
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    next();
  };
}

export const requireAdmin = requireRole('admin');
export const requireWorker = requireRole('worker', 'admin');
