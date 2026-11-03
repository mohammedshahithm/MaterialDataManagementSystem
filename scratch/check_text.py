import os
import pypdfium2 as pdfium

def analyze(pdf_path):
    pdf = pdfium.PdfDocument(pdf_path)
    print(f"\n--- Analyzing {os.path.basename(pdf_path)} ({len(pdf)} pages) ---")
    for i, page in enumerate(pdf):
        text_page = page.get_textpage()
        text = text_page.get_text_range()
        lines = [l.strip() for l in text.splitlines() if l.strip()]
        first_few = " | ".join(lines[:3]) if lines else "(NO TEXT / IMAGE ONLY)"
        print(f"Page {i+1}: {len(lines)} lines -> {first_few[:120]}")

analyze("scratch/qa_inspection/PRD_-001-report.pdf")
analyze("scratch/qa_inspection/PRD_-001-CORRECTED-report.pdf")

