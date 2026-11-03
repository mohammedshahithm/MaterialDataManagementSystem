import os
import pypdfium2 as pdfium

def render_pdf(pdf_path, out_dir):
    os.makedirs(out_dir, exist_ok=True)
    pdf = pdfium.PdfDocument(pdf_path)
    print(f"Rendering {pdf_path}: {len(pdf)} pages")
    for i, page in enumerate(pdf):
        image = page.render(scale=1.5).to_pil()
        out_file = os.path.join(out_dir, f"page_{i+1}.png")
        image.save(out_file)
        print(f"  Saved page {i+1} -> {out_file} ({image.width}x{image.height})")

def main():
    base_dir = os.path.dirname(__file__)
    old_pdf = os.path.join(base_dir, "qa_inspection/PRD_-001-report.pdf")
    new_pdf = os.path.join(base_dir, "qa_inspection/PRD_-001-CORRECTED-report.pdf")
    
    if os.path.exists(old_pdf):
        render_pdf(old_pdf, os.path.join(base_dir, "qa_inspection/rendered_old"))
    if os.path.exists(new_pdf):
        render_pdf(new_pdf, os.path.join(base_dir, "qa_inspection/rendered_new"))

if __name__ == "__main__":
    main()

