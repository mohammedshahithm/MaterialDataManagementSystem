import { Request, Response, NextFunction } from 'express';
import { supabaseAdmin } from '../config/supabase';
import prisma from '../config/database';
import { logAudit } from '../services/auditService';
import { AppError } from '../middleware/errorHandler';
import { z } from 'zod';

const inviteSchema = z.object({
  email: z.string().email('Valid email is required'),
  fullName: z.string().min(1, 'Full name is required').max(100),
  role: z.enum(['admin', 'worker']).default('worker'),
  password: z.string().min(6, 'Password must be at least 6 characters').max(72),
});

const setupAdminSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6).max(72),
  fullName: z.string().min(1).max(100),
  setupSecret: z.string().min(1),
});

export const authController = {
  /**
   * GET /api/auth/me
   * Returns the authenticated user's profile from the database.
   * Role is ALWAYS read from Prisma, never from the frontend.
   */
  async me(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user) {
        return res.status(401).json({ error: 'Not authenticated' });
      }

      const dbUser = await prisma.user.findUnique({
        where: { id: req.user.id },
        select: {
          id: true,
          email: true,
          fullName: true,
          role: true,
          createdAt: true,
        },
      });

      if (!dbUser) {
        return res.status(404).json({ error: 'User record not found' });
      }

      return res.json(dbUser);
    } catch (err) {
      next(err);
    }
  },

  /**
   * POST /api/auth/invite
   * Admin-only: Create a new user with a specific role.
   * Creates the user in Supabase Auth AND in the Prisma database.
   */
  async inviteUser(req: Request, res: Response, next: NextFunction) {
    try {
      const data = inviteSchema.parse(req.body);
      const adminId = req.user!.id;

      // Check if user already exists in our DB
      const existing = await prisma.user.findUnique({
        where: { email: data.email },
      });
      if (existing) {
        throw new AppError('A user with this email already exists', 409);
      }

      // Create user in Supabase Auth (using admin client)
      const { data: authData, error: authError } =
        await supabaseAdmin.auth.admin.createUser({
          email: data.email,
          password: data.password,
          email_confirm: true, // Auto-confirm since admin is creating
          user_metadata: { full_name: data.fullName },
        });

      if (authError) {
        throw new AppError(`Supabase auth error: ${authError.message}`, 400);
      }

      if (!authData.user) {
        throw new AppError('Failed to create Supabase user', 500);
      }

      // Create user record in Prisma DB with the correct role
      const dbUser = await prisma.user.create({
        data: {
          id: authData.user.id,
          email: data.email,
          fullName: data.fullName,
          role: data.role,
        },
      });

      await logAudit(adminId, 'INVITE_USER', 'user', dbUser.id, {
        email: data.email,
        role: data.role,
      });

      return res.status(201).json({
        id: dbUser.id,
        email: dbUser.email,
        fullName: dbUser.fullName,
        role: dbUser.role,
        createdAt: dbUser.createdAt,
      });
    } catch (err) {
      next(err);
    }
  },

  /**
   * GET /api/auth/setup-status
   * Checks whether the first admin needs to be created.
   */
  async setupStatus(_req: Request, res: Response, next: NextFunction) {
    try {
      const existingAdmin = await prisma.user.findFirst({
        where: { role: 'admin' },
        select: { id: true },
      });
      return res.json({ needsSetup: !existingAdmin });
    } catch (err) {
      next(err);
    }
  },

  /**
   * POST /api/auth/setup-first-admin
   * One-time endpoint to create the first admin user.
   * Only works if no admin users exist yet.
   * Requires a setup secret from the environment.
   */
  async setupFirstAdmin(req: Request, res: Response, next: NextFunction) {
    try {
      const data = setupAdminSchema.parse(req.body);

      // Check if any admin exists first
      const existingAdmin = await prisma.user.findFirst({
        where: { role: 'admin' },
      });

      if (existingAdmin) {
        throw new AppError(
          'An admin user already exists. Use the invite system instead.',
          409
        );
      }

      // Verify setup secret (use SUPABASE_SERVICE_ROLE_KEY last 8 chars as setup secret)
      const expectedSecret = process.env.SUPABASE_SERVICE_ROLE_KEY?.slice(-8) || '';
      if (!expectedSecret || data.setupSecret !== expectedSecret) {
        throw new AppError('Invalid setup secret', 403);
      }

      // Create in Supabase Auth
      const { data: authData, error: authError } =
        await supabaseAdmin.auth.admin.createUser({
          email: data.email,
          password: data.password,
          email_confirm: true,
          user_metadata: { full_name: data.fullName },
        });

      if (authError) {
        throw new AppError(`Supabase auth error: ${authError.message}`, 400);
      }

      if (!authData.user) {
        throw new AppError('Failed to create Supabase user', 500);
      }

      // Create admin in Prisma
      const dbUser = await prisma.user.create({
        data: {
          id: authData.user.id,
          email: data.email,
          fullName: data.fullName,
          role: 'admin',
        },
      });

      return res.status(201).json({
        message: 'First admin created successfully',
        id: dbUser.id,
        email: dbUser.email,
        fullName: dbUser.fullName,
        role: dbUser.role,
      });
    } catch (err) {
      next(err);
    }
  },

  /**
   * POST /api/auth/verify-admin-passcode
   * Validates the administrator passcode for privileged operations.
   */
  async verifyAdminPasscode(req: Request, res: Response, next: NextFunction) {
    try {
      const { passcode } = req.body;
      const expectedPasscode = process.env.ADMIN_SECRET_KEY || process.env.ADMIN_PASSCODE || 'AdminSecurityPasscode2026!';

      if (!passcode || passcode !== expectedPasscode) {
        return res.status(403).json({ valid: false, error: 'Invalid administrator passcode' });
      }

      return res.json({ valid: true, role: 'admin' });
    } catch (err) {
      next(err);
    }
  },
};
