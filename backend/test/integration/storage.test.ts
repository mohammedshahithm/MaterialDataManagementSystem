import { describe, it, expect, afterAll } from 'vitest';
import { storageService } from '../../src/services/storageService';
import { v4 as uuidv4 } from 'uuid';

describe('Supabase Storage Integration Tests', () => {
  const testRunId = uuidv4().substring(0, 8);
  const testStorageKey = `qa-test-folder/${testRunId}/sample-image.png`;
  const dummyContent = Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex'); // basic binary buffer

  afterAll(async () => {
    try {
      await storageService.deleteFile(testStorageKey);
    } catch {
      // Ignored if already cleaned up
    }
  });

  it('uploads a file buffer to private Supabase Storage bucket', async () => {
    await expect(
      storageService.uploadFile(testStorageKey, dummyContent, 'image/png')
    ).resolves.not.toThrow();
  });

  it('verifies uploaded file existence in bucket', async () => {
    const check = await storageService.fileExists(testStorageKey);
    expect(check.exists).toBe(true);
    if (check.exists) {
      expect(check.size).toBeGreaterThan(0);
    }
  });

  it('generates a signed download URL with attachment content-disposition', async () => {
    const signedUrl = await storageService.getSignedUrl(testStorageKey, 300, {
      download: 'sample-image.png',
    });
    expect(typeof signedUrl).toBe('string');
    expect(signedUrl).toContain('http');
    expect(signedUrl).toContain('token=');
    expect(signedUrl).toMatch(/download=|response-content-disposition/);
  });

  it('generates an inline signed URL without download header for browser preview', async () => {
    const inlineUrl = await storageService.getSignedUrl(testStorageKey, 300);
    expect(typeof inlineUrl).toBe('string');
    expect(inlineUrl).toContain('http');
    expect(inlineUrl).toContain('token=');
    expect(inlineUrl).not.toContain('download=');
    expect(inlineUrl).not.toContain('response-content-disposition');
  });

  it('deletes the uploaded test file cleanly', async () => {
    await expect(storageService.deleteFile(testStorageKey)).resolves.not.toThrow();
    const check = await storageService.fileExists(testStorageKey);
    expect(check.exists).toBe(false);
  });

  it('generates a signed upload URL and accepts direct PUT upload', async () => {
    const directKey = `qa-test-folder/${testRunId}/direct-put-test.png`;
    const signedUpload = await storageService.createSignedUploadUrl(directKey);

    expect(signedUpload.signedUrl).toContain('http');
    expect(signedUpload.signedUrl).toContain('token=');
    expect(signedUpload.path).toBe(directKey);

    // Perform direct client PUT upload
    const putRes = await fetch(signedUpload.signedUrl, {
      method: 'PUT',
      body: dummyContent,
      headers: { 'Content-Type': 'image/png' },
    });
    expect(putRes.ok).toBe(true);

    // Verify object presence and header inspection
    const header = await storageService.fetchObjectHeader(directKey);
    expect(header.exists).toBe(true);
    expect(header.size).toBe(dummyContent.length);
    expect(header.buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toBe(true);

    // Cleanup
    await storageService.deleteFile(directKey);
  });
});
