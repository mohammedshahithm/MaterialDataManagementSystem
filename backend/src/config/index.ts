import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

export const config = {
  port: parseInt(process.env.PORT || '3001', 10),
  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:5173',
  backendUrl: process.env.BACKEND_URL || 'http://localhost:3001',

  supabase: {
    url: process.env.SUPABASE_URL || '',
    anonKey: process.env.SUPABASE_ANON_KEY || '',
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY || '',
  },

  auth: {
    noLoginMode: process.env.NO_LOGIN_MODE !== 'false',
    adminSecretKey: process.env.ADMIN_SECRET_KEY || process.env.ADMIN_PASSCODE || 'AdminSecurityPasscode2026!',
    internalNetworkOnly: process.env.INTERNAL_NETWORK_ONLY === 'true',
    allowedIps: (process.env.ALLOWED_IPS || '').split(',').map((s) => s.trim()).filter(Boolean),
  },

  storage: {
    bucketName: process.env.SUPABASE_STORAGE_BUCKET || 'material-data',
  },

  app: {
    timezone: process.env.APP_TIMEZONE || 'Asia/Kolkata',
    retentionDays: parseInt(process.env.RETENTION_DAYS || '5', 10),
    storageWarningGb: parseFloat(process.env.APP_STORAGE_WARNING_GB || '0.8'),
    maxFileSizeMb: parseInt(process.env.MAX_FILE_SIZE_MB || '25', 10),
    signedUrlExpiry: parseInt(process.env.SIGNED_URL_EXPIRY_SECONDS || '900', 10),
  },

  // Allowed MIME types per category
  allowedTypes: {
    microstructure: ['image/jpeg', 'image/png', 'image/tiff'],
    graph: ['image/jpeg', 'image/png'],
    source_pdf: ['application/pdf'],
    whatsapp_image: ['image/jpeg', 'image/png', 'image/webp'],
  } as Record<string, string[]>,

  allowedExtensions: {
    microstructure: ['.jpg', '.jpeg', '.png', '.tiff', '.tif'],
    graph: ['.jpg', '.jpeg', '.png'],
    source_pdf: ['.pdf'],
    whatsapp_image: ['.jpg', '.jpeg', '.png', '.webp'],
  } as Record<string, string[]>,

  maxSlots: {
    microstructure: 3,
    graph: 1,
    source_pdf: 1,
    whatsapp_image: 1,
    generated_report: 100, // version history
  } as Record<string, number>,
} as const;
