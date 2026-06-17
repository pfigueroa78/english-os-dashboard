#!/usr/bin/env python3
"""Extract auditable page evidence for every Student Book class pack."""

from __future__ import annotations

import argparse
import json
import re
from pathlib import Path

import pdfplumber


ROOT = Path(__file__).resolve().parents[1]
PACK_DIR = ROOT / "knowledge" / "class-packs-lesson-vision"


def field(text: str, label: str) -> str:
    match = re.search(rf"^- {re.escape(label)}:\s*([^\n]+)", text, re.MULTILINE | re.IGNORECASE)
    return match.group(1).strip() if match else ""


def number_field(text: str, label: str) -> int:
    match = re.search(r"\d+", field(text, label))
    return int(match.group()) if match else 0


def page_range(text: str) -> list[int]:
    value = field(text, "Active class PDF pages") or field(text, "PDF pages")
    numbers = [int(value) for value in re.findall(r"\d+", value)]
    if len(numbers) >= 2:
        return list(range(min(numbers[0], numbers[1]), max(numbers[0], numbers[1]) + 1))
    return numbers[:1]


def detect_sections(text: str) -> list[str]:
    def heading(word: str) -> str:
        letters = []
        for char in word.upper():
            if char == "I":
                letters.append("[IL1]")
            elif char == "O":
                letters.append("[O0]")
            elif char.isalpha():
                letters.append(re.escape(char))
            elif char == "&":
                letters.append("&")
        sequence = r"[\W_]*".join(letters)
        return rf"^.{{0,30}}?{sequence}[\W_]*$"

    patterns = [
        ("Starting point", heading("STARTING POINT")),
        ("Vocabulary & Speaking", heading("VOCABULARY&SPEAKING")),
        ("Listening & Speaking", heading("LISTENING&SPEAKING")),
        ("Role Play", heading("ROLE PLAY")),
        ("Grammar", heading("GRAMMAR")),
        ("Discussion", heading("DISCUSSION")),
        ("Reading", heading("READING")),
        ("Writing", heading("WRITING")),
        ("Listening", heading("LISTENING")),
        ("Vocabulary", heading("VOCABULARY")),
        ("Speaking", heading("SPEAKING")),
    ]
    hits: list[tuple[int, int, str]] = []
    for label, pattern in patterns:
        for match in re.finditer(pattern, text, re.MULTILINE):
            hits.append((match.start(), match.end(), label))
    combined = {
        "Vocabulary": {"Vocabulary & Speaking"},
        "Listening": {"Listening & Speaking"},
        "Speaking": {"Vocabulary & Speaking", "Listening & Speaking"},
    }
    result: list[str] = []
    for start, end, label in sorted(hits):
        overlapping_combined = any(
            combined_label in combined.get(label, set()) and combined_start - 5 <= start and end <= combined_end + 5
            for combined_start, combined_end, combined_label in hits
        )
        if overlapping_combined:
            continue
        if label not in result:
            result.append(label)
    return result


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--pdf", required=True, help="Path to the Passages Level 1 Student Book PDF")
    parser.add_argument("--output", default="knowledge/passages-pdf-evidence.json")
    parser.add_argument("--sync-packs", action="store_true", help="Replace extracted source blocks with complete verified PDF page text")
    parser.add_argument("--render-dir", default="tmp/pdfs/passages-contract-audit", help="Workspace-relative directory for temporary page renders")
    args = parser.parse_args()

    pdf_path = Path(args.pdf).resolve()
    output_path = (ROOT / args.output).resolve() if not Path(args.output).is_absolute() else Path(args.output)
    render_dir = (ROOT / args.render_dir).resolve() if not Path(args.render_dir).is_absolute() else Path(args.render_dir)
    render_dir.mkdir(parents=True, exist_ok=True)
    classes = []
    with pdfplumber.open(str(pdf_path)) as reader:
      for pack_path in sorted(PACK_DIR.glob("*.md")):
        source = pack_path.read_text(encoding="utf-8")
        if field(source, "Lesson type").lower() != "student book class":
            continue
        pdf_pages = page_range(source)
        pages = []
        for pdf_page in pdf_pages:
            if pdf_page < 1 or pdf_page > len(reader.pages):
                raise ValueError(f"{pack_path.name}: PDF page {pdf_page} is outside 1-{len(reader.pages)}")
            raw_page_text = reader.pages[pdf_page - 1].extract_text(layout=True) or ""
            page_text = "\n".join(line.rstrip() for line in raw_page_text.splitlines())
            image_path = render_dir / f"pdf-page-{pdf_page:03d}.png"
            if not image_path.exists():
                reader.pages[pdf_page - 1].to_image(resolution=110).save(str(image_path))
            pages.append({"pdfPage": pdf_page, "text": page_text.strip(), "image": image_path.relative_to(ROOT).as_posix()})
        combined = "\n\n".join(page["text"] for page in pages)
        book_numbers = [int(value) for value in re.findall(r"\d+", field(source, "Active class book pages") or field(source, "Book pages"))]
        book_start = min(book_numbers) if book_numbers else 0
        if args.sync_packs:
            marker = "## Extracted Student Book content"
            if marker not in source:
                raise ValueError(f"{pack_path.name}: missing extracted content marker")
            blocks = []
            for index, page in enumerate(pages):
                book_page = book_start + index if book_start else "unknown"
                blocks.append(
                    f"## PDF_PAGE {page['pdfPage']} | BOOK_PAGE {book_page}\n"
                    f"PDF_PAGE: {page['pdfPage']}\nBOOK_PAGE: {book_page}\n\n{page['text']}"
                )
            pack_path.write_text(source[: source.index(marker)] + marker + "\n\n" + "\n\n".join(blocks) + "\n", encoding="utf-8")
        classes.append(
            {
                "filename": pack_path.name,
                "unit": number_field(source, "Unit"),
                "localClass": number_field(source, "Local class inside unit"),
                "globalClass": number_field(source, "Global English OS class"),
                "bookPages": field(source, "Active class book pages") or field(source, "Book pages"),
                "pdfPages": field(source, "Active class PDF pages") or field(source, "PDF pages"),
                "pages": pages,
                "detectedSections": detect_sections(combined),
            }
        )

      pdf_page_count = len(reader.pages)

    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(
        json.dumps(
            {
                "schemaVersion": 1,
                "sourcePdf": pdf_path.name,
                "pdfPageCount": pdf_page_count,
                "studentBookClasses": len(classes),
                "classes": classes,
            },
            ensure_ascii=False,
            indent=2,
        )
        + "\n",
        encoding="utf-8",
    )
    print(json.dumps({"ok": True, "classes": len(classes), "packsSynced": args.sync_packs, "output": str(output_path)}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
