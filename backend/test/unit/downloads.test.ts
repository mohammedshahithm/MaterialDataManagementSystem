import { describe, it, expect } from 'vitest';

describe('Download Tracking and Status Determination', () => {
  function computeDownloadStatus(params: {
    totalProducts: number;
    reportsGeneratedCount: number;
    reportsDownloadedCount: number;
    productZipsDownloadedCount: number;
    batchZipDownloaded: boolean;
  }): 'not_downloaded' | 'partially_downloaded' | 'downloaded' {
    const {
      totalProducts,
      reportsGeneratedCount,
      reportsDownloadedCount,
      productZipsDownloadedCount,
      batchZipDownloaded,
    } = params;

    if (
      batchZipDownloaded ||
      (totalProducts > 0 &&
        reportsGeneratedCount === totalProducts &&
        reportsDownloadedCount === totalProducts &&
        productZipsDownloadedCount === totalProducts)
    ) {
      return 'downloaded';
    } else if (
      reportsDownloadedCount > 0 ||
      productZipsDownloadedCount > 0 ||
      batchZipDownloaded
    ) {
      return 'partially_downloaded';
    }
    return 'not_downloaded';
  }

  it('reports "not_downloaded" when no files or zips have been downloaded', () => {
    const status = computeDownloadStatus({
      totalProducts: 3,
      reportsGeneratedCount: 3,
      reportsDownloadedCount: 0,
      productZipsDownloadedCount: 0,
      batchZipDownloaded: false,
    });
    expect(status).toBe('not_downloaded');
  });

  it('reports "partially_downloaded" when some product reports or product zips are downloaded', () => {
    const status = computeDownloadStatus({
      totalProducts: 3,
      reportsGeneratedCount: 3,
      reportsDownloadedCount: 1,
      productZipsDownloadedCount: 0,
      batchZipDownloaded: false,
    });
    expect(status).toBe('partially_downloaded');
  });

  it('reports "downloaded" when the complete batch ZIP has been downloaded', () => {
    const status = computeDownloadStatus({
      totalProducts: 3,
      reportsGeneratedCount: 3,
      reportsDownloadedCount: 0,
      productZipsDownloadedCount: 0,
      batchZipDownloaded: true,
    });
    expect(status).toBe('downloaded');
  });

  it('reports "downloaded" when all individual product reports and product ZIPs are downloaded', () => {
    const status = computeDownloadStatus({
      totalProducts: 2,
      reportsGeneratedCount: 2,
      reportsDownloadedCount: 2,
      productZipsDownloadedCount: 2,
      batchZipDownloaded: false,
    });
    expect(status).toBe('downloaded');
  });

  it('computes product workflow completion percentage based on 8 required checklist items', () => {
    const checklist = {
      microstructure1: true,
      microstructure2: true,
      microstructure3: false, // optional
      graph: true,
      sourcePdf: true,
      whatsappImage: true,
      reportGenerated: true,
      reportDownloaded: true,
      zipDownloaded: true,
    };

    const steps = [
      checklist.microstructure1,
      checklist.microstructure2,
      checklist.graph,
      checklist.sourcePdf,
      checklist.whatsappImage,
      checklist.reportGenerated,
      checklist.reportDownloaded,
      checklist.zipDownloaded,
    ];

    const completionPercent = Math.round(
      (steps.filter(Boolean).length / steps.length) * 100
    );

    expect(completionPercent).toBe(100);
  });
});

