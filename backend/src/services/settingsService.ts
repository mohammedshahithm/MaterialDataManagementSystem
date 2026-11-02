import prisma from '../config/database';
import { config } from '../config';

export interface RuntimeSettings {
  retentionDays: number;
  storageWarningGb: number;
  maxFileSizeMb: number;
  requiredCategories: string[];
}

let cachedSettings: RuntimeSettings | null = null;
let cacheExpiry: number = 0;
const SETTINGS_CACHE_TTL_MS = 60 * 1000; // 60 seconds

export function invalidateSettingsCache(): void {
  cachedSettings = null;
  cacheExpiry = 0;
}

export async function getRuntimeSettings(): Promise<RuntimeSettings> {
  const now = Date.now();
  if (cachedSettings && now < cacheExpiry) {
    return cachedSettings;
  }

  try {
    const settings = await prisma.appSetting.findMany();
    const map: Record<string, any> = {};
    for (const s of settings) {
      map[s.key] = s.value;
    }

    const resolved: RuntimeSettings = {
      retentionDays: typeof map.retentionDays === 'number' ? map.retentionDays : config.app.retentionDays,
      storageWarningGb: typeof map.storageWarningGb === 'number' ? map.storageWarningGb : config.app.storageWarningGb,
      maxFileSizeMb: typeof map.maxFileSizeMb === 'number' ? map.maxFileSizeMb : config.app.maxFileSizeMb,
      requiredCategories: Array.isArray(map.requiredCategories)
        ? map.requiredCategories
        : ['microstructure', 'graph', 'source_pdf', 'whatsapp_image'],
    };

    cachedSettings = resolved;
    cacheExpiry = now + SETTINGS_CACHE_TTL_MS;
    return resolved;
  } catch {
    return {
      retentionDays: config.app.retentionDays,
      storageWarningGb: config.app.storageWarningGb,
      maxFileSizeMb: config.app.maxFileSizeMb,
      requiredCategories: ['microstructure', 'graph', 'source_pdf', 'whatsapp_image'],
    };
  }
}
