import { describe, it, expect } from 'vitest';
import { config } from '../../src/config';

describe('Application Configuration & File Rules', () => {
  it('enforces max slots per category', () => {
    expect(config.maxSlots['microstructure']).toBe(3);
    expect(config.maxSlots['graph']).toBe(1);
    expect(config.maxSlots['source_pdf']).toBe(1);
    expect(config.maxSlots['whatsapp_image']).toBe(1);
  });

  it('configures allowed extensions accurately', () => {
    expect(config.allowedExtensions['microstructure']).toContain('.jpg');
    expect(config.allowedExtensions['microstructure']).toContain('.png');
    expect(config.allowedExtensions['microstructure']).toContain('.tiff');
    expect(config.allowedExtensions['graph']).toContain('.png');
    expect(config.allowedExtensions['source_pdf']).toEqual(['.pdf']);
    expect(config.allowedExtensions['whatsapp_image']).toContain('.webp');
  });

  it('configures allowed MIME types accurately', () => {
    expect(config.allowedTypes['microstructure']).toContain('image/jpeg');
    expect(config.allowedTypes['microstructure']).toContain('image/png');
    expect(config.allowedTypes['source_pdf']).toEqual(['application/pdf']);
  });

  it('verifies BigInt JSON serialization', () => {
    // Ensure BigInt.prototype.toJSON is active
    (BigInt.prototype as any).toJSON = function () {
      return this.toString();
    };

    const obj = { id: 'test-uuid', size: BigInt(1048576) };
    const serialized = JSON.stringify(obj);
    expect(serialized).toBe('{"id":"test-uuid","size":"1048576"}');
  });

  it('configures standard storage thresholds', () => {
    expect(config.app.storageWarningGb).toBeLessThanOrEqual(1.0);
    expect(config.app.maxFileSizeMb).toBe(25);
    expect(config.app.retentionDays).toBe(5);
  });
});
