import os
import pypdfium2 as pdfium

def render_cases():
    base_dir = os.path.dirname(__file__)
    qa_dir = os.path.join(base_dir, "qa_inspection")
    
    cases = ["CASE_1_Report.pdf", "CASE_2_Report.pdf", "CASE_3_Report.pdf", "CASE_4_Report.pdf"]
    for case in cases:
        pdf_path = os.path.join(qa_dir, case)
        out_sub = os.path.join(qa_dir, "rendered_" + case.replace(".pdf", ""))
        os.makedirs(out_sub, exist_ok=True)
        pdf = pdfium.PdfDocument(pdf_path)
        print(f"\n{case}: {len(pdf)} pages")
        for i, page in enumerate(pdf):
            img = page.render(scale=1.0).to_pil()
            img_path = os.path.join(out_sub, f"page_{i+1}.png")
            img.save(img_path)
            # Check text
            tp = page.get_textpage()
            txt = tp.get_text_range().strip()
            first_line = txt.splitlines()[0] if txt else "(NO TEXT / IMAGE ONLY)"
            last_line = txt.splitlines()[-1] if txt else ""
            print(f"  Page {i+1} ({img.width}x{img.height}): first='{first_line[:40]}' last='{last_line[:30]}'")

if __name__ == "__main__":
    render_cases()

