#!/usr/bin/env python3
"""
Patch Passages Student Book class-pack contracts safely.

This script is intentionally metadata-only. It does not contain copied Student
Book text and it does not replace extracted content. It opens the existing
class-pack Markdown files, inserts or replaces the Active class teaching
contract block near the top, and preserves the rest of each file byte-for-byte.

Usage:
  python scripts/patch_passages_student_book_contracts.py --units 4
  python scripts/patch_passages_student_book_contracts.py --units 4-12
  python scripts/patch_passages_student_book_contracts.py --units 4,5,6 --check
"""

from __future__ import annotations

import argparse
import re
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable

ROOT = Path(__file__).resolve().parents[1]
PACK_DIR = ROOT / "knowledge" / "class-packs-lesson-vision"
START = "<!-- PASSAGES_ACTIVE_CONTRACT_START -->"
END = "<!-- PASSAGES_ACTIVE_CONTRACT_END -->"


@dataclass(frozen=True)
class StudentBookClass:
    unit: int
    local: int
    global_class: int
    book_start: int
    book_end: int
    pdf_start: int
    pdf_end: int
    lesson: str
    section_names: str
    skill: str
    grammar_focus: str
    vocabulary_focus: str
    functions: str
    target_structures: str
    production: str

    @property
    def filename(self) -> str:
        return (
            f"unit-{self.unit:02d}-local-class-{self.local:02d}-"
            f"global-class-{self.global_class:02d}-class-pack-unit-{self.unit:02d}-"
            f"class-{self.global_class:02d}.md"
        )


def lesson_profile(unit: int, local: int) -> dict[str, str]:
    if local == 1:
        return {
            "lesson": "Lesson A",
            "section_names": "Lesson A + Vocabulary + Grammar + Speaking",
            "skill": "Vocabulary, grammar, speaking",
            "grammar_focus": f"Extract exact grammar focus from Unit {unit} Lesson A indexed pages; do not infer unindexed wording.",
            "vocabulary_focus": f"Extract vocabulary from Unit {unit} Lesson A indexed pages; recycle only confirmed unit vocabulary.",
            "functions": "Introduce the lesson topic, teach the indexed vocabulary and grammar, and guide controlled speaking practice.",
            "target_structures": "Use the target language from the indexed page range. Do not invent structures outside the class pack.",
            "production": "Short controlled and personalized answers based on the indexed Student Book prompts.",
        }
    if local == 2:
        return {
            "lesson": "Lesson A extension",
            "section_names": "Lesson A extension + Listening/Reading/Writing + Speaking",
            "skill": "Listening, speaking, reading/writing",
            "grammar_focus": f"Reinforce Unit {unit} Lesson A grammar using the indexed extension pages.",
            "vocabulary_focus": f"Recycle Unit {unit} Lesson A vocabulary from the indexed extension pages.",
            "functions": "Extend Lesson A into comprehension, guided production, and short written or spoken output.",
            "target_structures": "Use the indexed lesson language in longer answers; do not add unverified book content.",
            "production": "Comprehension answers plus a short spoken or written response connected to the lesson.",
        }
    if local == 4:
        return {
            "lesson": "Lesson B",
            "section_names": "Lesson B + Vocabulary + Grammar + Speaking",
            "skill": "Vocabulary, grammar, speaking",
            "grammar_focus": f"Extract exact grammar focus from Unit {unit} Lesson B indexed pages; do not infer unindexed wording.",
            "vocabulary_focus": f"Extract vocabulary from Unit {unit} Lesson B indexed pages; recycle only confirmed unit vocabulary.",
            "functions": "Introduce Lesson B topic, teach indexed vocabulary and grammar, and guide controlled speaking practice.",
            "target_structures": "Use the target language from the indexed page range. Do not invent structures outside the class pack.",
            "production": "Short controlled and personalized answers based on the indexed Student Book prompts.",
        }
    if local == 5:
        return {
            "lesson": "Lesson B extension",
            "section_names": "Lesson B extension + Listening/Reading/Writing + Speaking",
            "skill": "Listening, speaking, reading/writing",
            "grammar_focus": f"Reinforce Unit {unit} Lesson B grammar using the indexed extension pages.",
            "vocabulary_focus": f"Recycle Unit {unit} Lesson B vocabulary from the indexed extension pages.",
            "functions": "Extend Lesson B into comprehension, guided production, and short written or spoken output.",
            "target_structures": "Use the indexed lesson language in longer answers; do not add unverified book content.",
            "production": "Comprehension answers plus a short spoken or written response connected to the lesson.",
        }
    raise ValueError(f"Unsupported Student Book local class: {local}")


def build_classes() -> list[StudentBookClass]:
    # unit: [(global, local, book_start, book_end, pdf_start, pdf_end), ...]
    raw = {
        4: [(22, 1, 28, 29, 37, 38), (23, 2, 30, 31, 39, 40), (25, 4, 32, 33, 41, 42), (26, 5, 34, 35, 43, 44)],
        5: [(29, 1, 36, 37, 45, 46), (30, 2, 38, 39, 47, 48), (32, 4, 40, 41, 49, 50), (33, 5, 42, 43, 51, 52)],
        6: [(36, 1, 44, 45, 53, 54), (37, 2, 46, 47, 55, 56), (39, 4, 48, 49, 57, 58), (40, 5, 50, 51, 59, 60)],
        7: [(43, 1, 54, 55, 63, 64), (44, 2, 56, 57, 65, 66), (46, 4, 58, 59, 67, 68), (47, 5, 60, 61, 69, 70)],
        8: [(50, 1, 62, 63, 71, 72), (51, 2, 64, 65, 73, 74), (53, 4, 66, 67, 75, 76), (54, 5, 68, 69, 77, 78)],
        9: [(57, 1, 70, 71, 79, 80), (58, 2, 72, 73, 81, 82), (60, 4, 74, 75, 83, 84), (61, 5, 76, 77, 85, 86)],
        10: [(64, 1, 80, 81, 89, 90), (65, 2, 82, 83, 91, 92), (67, 4, 84, 85, 93, 94), (68, 5, 86, 87, 95, 96)],
        11: [(71, 1, 88, 89, 97, 98), (72, 2, 90, 91, 99, 100), (74, 4, 92, 93, 101, 102), (75, 5, 94, 95, 103, 104)],
        12: [(78, 1, 96, 97, 105, 106), (79, 2, 98, 99, 107, 108), (81, 4, 100, 101, 109, 110), (82, 5, 102, 103, 111, 112)],
    }
    classes: list[StudentBookClass] = []
    for unit, rows in raw.items():
        for global_class, local, bs, be, ps, pe in rows:
            profile = lesson_profile(unit, local)
            classes.append(
                StudentBookClass(
                    unit=unit,
                    local=local,
                    global_class=global_class,
                    book_start=bs,
                    book_end=be,
                    pdf_start=ps,
                    pdf_end=pe,
                    **profile,
                )
            )
    return classes


def parse_units(value: str) -> set[int]:
    units: set[int] = set()
    for part in value.split(","):
        part = part.strip()
        if not part:
            continue
        if "-" in part:
            start, end = [int(x) for x in part.split("-", 1)]
            units.update(range(start, end + 1))
        else:
            units.add(int(part))
    invalid = sorted(u for u in units if u < 4 or u > 12)
    if invalid:
        raise SystemExit(f"Only units 4-12 are supported by this patcher. Invalid: {invalid}")
    return units


def marker_present(text: str, marker: str) -> bool:
    return marker in text


def build_contract(item: StudentBookClass, text: str) -> str:
    book_markers = [f"BOOK_PAGE {item.book_start}", f"BOOK_PAGE {item.book_end}"]
    pdf_markers = [f"PDF_PAGE {item.pdf_start}", f"PDF_PAGE {item.pdf_end}"]
    missing = [m for m in book_markers + pdf_markers if not marker_present(text, m)]
    if missing:
        blocker = "; ".join(missing)
        source_status = (
            f"Source extraction blocker: expected page marker(s) not found in the existing extracted content: {blocker}. "
            "Do not invent missing page text."
        )
    else:
        source_status = "Indexed source markers are present for the expected page range."

    return f"""{START}
### Active class teaching contract
- Active class: Unit {item.unit}, local class {item.local}, global class {item.global_class}
- Lesson title: Unit {item.unit} {item.lesson}
- Active class book pages: {item.book_start}-{item.book_end}
- Active class PDF pages: {item.pdf_start}-{item.pdf_end}
- Active class section names: {item.section_names}
- Active class skill focus: {item.skill}
- Active class grammar focus: {item.grammar_focus}
- Active class vocabulary focus: {item.vocabulary_focus}
- Active class functions: {item.functions}
- Active class target structures: {item.target_structures}
- Expected learner production: {item.production}
- Source status: {source_status}

### Safety rule
Preserve the existing extracted Student Book content exactly as indexed. Do not fabricate missing page text, transcript text, answer keys, audio scripts, or exercises.
{END}
"""


def insert_or_replace_contract(original: str, contract: str) -> str:
    pattern = re.compile(re.escape(START) + r".*?" + re.escape(END) + r"\n?", re.S)
    if pattern.search(original):
        return pattern.sub(contract + "\n", original, count=1)

    anchor = "Teacher instruction: Use this file as the primary source for this exact class. Do not substitute content from another class.\n"
    if anchor in original:
        return original.replace(anchor, anchor + "\n" + contract + "\n", 1)

    sep = "\n---\n"
    if sep in original:
        return original.replace(sep, "\n" + contract + sep, 1)

    return contract + "\n" + original


def patch_one(item: StudentBookClass, check: bool = False) -> tuple[str, bool, str]:
    path = PACK_DIR / item.filename
    if not path.exists():
        return (str(path.relative_to(ROOT)), False, "missing file")
    original = path.read_text(encoding="utf-8")
    patched = insert_or_replace_contract(original, build_contract(item, original))
    changed = patched != original
    if changed and not check:
        path.write_text(patched, encoding="utf-8")
    return (str(path.relative_to(ROOT)), changed, "patched" if changed else "already current")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--units", required=True, help="Unit list/range, e.g. 4 or 4-12 or 4,5,6")
    parser.add_argument("--check", action="store_true", help="Report changes without writing files")
    args = parser.parse_args()

    selected_units = parse_units(args.units)
    selected = [item for item in build_classes() if item.unit in selected_units]
    changed = 0
    for item in selected:
        path, did_change, status = patch_one(item, check=args.check)
        changed += int(did_change)
        print(f"{status}: {path}")

    print(f"classes_checked={len(selected)} classes_changed={changed} mode={'check' if args.check else 'write'}")
    return 1 if args.check and changed else 0


if __name__ == "__main__":
    raise SystemExit(main())
