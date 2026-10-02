"""Generates the sample PDFs in data/raw/health/pdf.

The policy wordings are written here as plain text so the PDF can be rebuilt
deterministically. Every page carries a running header and footer on purpose:
the ingestion pipeline has to strip them. The second PDF has no text layer at
all, which is how a scanned form arrives in practice.

SYNTHETIC SAMPLE CONTENT: fictional company, not real policy terms.
"""
from pathlib import Path

from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.pdfgen import canvas

OUT_DIR = Path(__file__).resolve().parent.parent / "data" / "raw" / "health" / "pdf"

WORDINGS = [
    ("1. Preamble", [
        "This policy is a contract between the policyholder and Suraksha Health Insurance Ltd. "
        "This document is synthetic sample content written for an engineering assessment.",
    ]),
    ("2. Waiting Periods", [
        "2.1 Initial waiting period: expenses for any illness are excluded during the first 30 days "
        "from the first policy commencement date. This does not apply to accidental injury.",
        "2.2 Pre-existing diseases: expenses related to a pre-existing disease are excluded until the "
        "expiry of 36 months of continuous coverage after the date of inception of the first policy.",
        "2.3 Specified illnesses: cataract, hernia, benign prostatic hypertrophy, joint replacement "
        "and kidney stones are excluded until the expiry of 24 months of continuous coverage.",
    ]),
    ("3. Co-payment", [
        "3.1 A co-payment of 20% applies to every admissible claim for an insured person whose age at "
        "entry is 61 years or above. No co-payment applies to insured persons who enter below 61 years.",
    ]),
    ("4. Permanent Exclusions", [
        "4.1 The company shall not be liable for expenses arising from cosmetic or plastic surgery "
        "unless needed after an accident or burn, intentional self-injury, treatment for alcohol or "
        "drug abuse, war or nuclear risks, experimental or unproven treatment, infertility treatment, "
        "and dental treatment unless it needs hospitalisation due to an accident.",
        "4.2 Expenses for spectacles, contact lenses and hearing aids are excluded.",
    ]),
    ("5. Sum Insured Restoration", [
        "5.1 If the sum insured is exhausted during a policy year, it is restored by 100% once in that "
        "policy year. The restored amount can be used only for a different illness than the one for "
        "which the original claim was made.",
    ]),
    ("6. Renewal", [
        "6.1 The policy offers lifelong renewability, except on grounds of fraud, misrepresentation or "
        "non-disclosure of material facts. Renewal will not be denied because of claims made.",
        "6.2 A grace period of 30 days is allowed to renew the policy for annual premium payment mode.",
    ]),
    ("7. Free Look Period", [
        "7.1 A free look period of 30 days from the date of receipt of the policy document is available "
        "to review the terms and conditions. The free look period does not apply to renewals.",
    ]),
    ("8. Cancellation by the Policyholder", [
        "8.1 The policyholder may cancel the policy at any time by giving written notice. If no claim "
        "has been made, the refund is pro-rata for the unexpired policy period. If a claim has been "
        "made, no refund is due.",
    ]),
    ("9. Grievance Redressal", [
        "9.1 Complaints may be raised through the customer care number, email or branch. If a complaint "
        "is not resolved within 15 days, the policyholder may approach the Insurance Ombudsman.",
    ]),
]


def draw_frame(pdf: canvas.Canvas, page_no: int, total: int) -> None:
    width, height = A4
    pdf.setFont("Helvetica", 8)
    pdf.drawString(20 * mm, height - 12 * mm,
                   "Suraksha Health Insurance Ltd. | Family Shield Policy Wordings | UIN SHI-FS-2026 | Confidential")
    pdf.drawString(20 * mm, 10 * mm, f"Page {page_no} of {total}")
    pdf.drawRightString(width - 20 * mm, 10 * mm, "Effective 01/04/2026")


def wrap(text: str, limit: int = 95) -> list[str]:
    lines, current = [], ""
    for word in text.split():
        if len(current) + len(word) + 1 > limit:
            lines.append(current)
            current = word
        else:
            current = f"{current} {word}".strip()
    if current:
        lines.append(current)
    return lines


def build_wordings(path: Path) -> None:
    # Two clauses per page keeps the header/footer repeating several times,
    # which is the point of the fixture.
    pages = [WORDINGS[i:i + 2] for i in range(0, len(WORDINGS), 2)]
    pdf = canvas.Canvas(str(path), pagesize=A4)
    _, height = A4
    for page_no, sections in enumerate(pages, start=1):
        draw_frame(pdf, page_no, len(pages))
        y = height - 30 * mm
        for heading, clauses in sections:
            pdf.setFont("Helvetica-Bold", 12)
            pdf.drawString(20 * mm, y, heading)
            y -= 8 * mm
            pdf.setFont("Helvetica", 10)
            for clause in clauses:
                for line in wrap(clause):
                    pdf.drawString(20 * mm, y, line)
                    y -= 5 * mm
                y -= 3 * mm
            y -= 4 * mm
        pdf.showPage()
    pdf.save()


def build_scanned_form(path: Path) -> None:
    pdf = canvas.Canvas(str(path), pagesize=A4)
    width, height = A4
    pdf.setLineWidth(1)
    for row in range(12):
        y = height - 40 * mm - row * 15 * mm
        pdf.rect(20 * mm, y, width - 40 * mm, 10 * mm)
    pdf.showPage()
    pdf.save()


if __name__ == "__main__":
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    build_wordings(OUT_DIR / "family-shield-policy-wordings.pdf")
    build_scanned_form(OUT_DIR / "scanned-claim-form.pdf")
    print(f"wrote PDFs to {OUT_DIR}")
