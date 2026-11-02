import { describe, it, expect } from 'vitest';
import archiver from 'archiver';
import { PassThrough } from 'stream';

describe('ZIP Archive Engine Unit Tests', () => {
  it('streams valid ZIP archive with custom folder hierarchy and manifest', async () => {
    const archive = archiver('zip', { zlib: { level: 6 } });
    const outputStream = new PassThrough();
    const chunks: Buffer[] = [];

    outputStream.on('data', (c) => chunks.push(c));

    archive.pipe(outputStream);

    const manifest = {
      productCode: 'PROD-001',
      createdAt: new Date().toISOString(),
      files: [{ category: 'microstructure', filename: 'micro-01.png' }],
    };

    archive.append(Buffer.from('dummy image content'), { name: 'PROD-001/Microstructure/micro-01.png' });
    archive.append(JSON.stringify(manifest, null, 2), { name: 'PROD-001/manifest.json' });

    await archive.finalize();

    const zipBuffer = Buffer.concat(chunks);
    expect(zipBuffer.length).toBeGreaterThan(100);
    // ZIP magic header is 'PK\x03\x04'
    expect(zipBuffer[0]).toBe(0x50); // P
    expect(zipBuffer[1]).toBe(0x4b); // K
    expect(zipBuffer[2]).toBe(0x03);
    expect(zipBuffer[3]).toBe(0x04);
  });
});
