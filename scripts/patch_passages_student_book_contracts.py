#!/usr/bin/env python3
"""Safely patch Passages Student Book class-pack contracts.

Metadata-only: does not contain or rewrite copied Student Book text. It opens
existing Markdown files, inserts/replaces a bounded contract block, and
preserves the extracted content already present in each file.

Usage:
  python scripts/patch_passages_student_book_contracts.py --units 4
  python scripts/patch_passages_student_book_contracts.py --units 4-12
  python scripts/patch_passages_student_book_contracts.py --units 4-12 --check
"""
from __future__ import annotations
import argparse, re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PACK_DIR = ROOT / "knowledge" / "class-packs-lesson-vision"
START = "<!-- PASSAGES_ACTIVE_CONTRACT_START -->"
END = "<!-- PASSAGES_ACTIVE_CONTRACT_END -->"

ROWS = {
  4: [(22,1,28,29,37,38),(23,2,30,31,39,40),(25,4,32,33,41,42),(26,5,34,35,43,44)],
  5: [(29,1,36,37,45,46),(30,2,38,39,47,48),(32,4,40,41,49,50),(33,5,42,43,51,52)],
  6: [(36,1,44,45,53,54),(37,2,46,47,55,56),(39,4,48,49,57,58),(40,5,50,51,59,60)],
  7: [(43,1,54,55,63,64),(44,2,56,57,65,66),(46,4,58,59,67,68),(47,5,60,61,69,70)],
  8: [(50,1,62,63,71,72),(51,2,64,65,73,74),(53,4,66,67,75,76),(54,5,68,69,77,78)],
  9: [(57,1,70,71,79,80),(58,2,72,73,81,82),(60,4,74,75,83,84),(61,5,76,77,85,86)],
 10: [(64,1,80,81,89,90),(65,2,82,83,91,92),(67,4,84,85,93,94),(68,5,86,87,95,96)],
 11: [(71,1,88,89,97,98),(72,2,90,91,99,100),(74,4,92,93,101,102),(75,5,94,95,103,104)],
 12: [(78,1,96,97,105,106),(79,2,98,99,107,108),(81,4,100,101,109,110),(82,5,102,103,111,112)],
}

PROFILES = {
  1: ("Lesson A", "Lesson A + Vocabulary + Grammar + Speaking", "Vocabulary, grammar, speaking"),
  2: ("Lesson A extension", "Lesson A extension + Listening/Reading/Writing + Speaking", "Listening, speaking, reading/writing"),
  4: ("Lesson B", "Lesson B + Vocabulary + Grammar + Speaking", "Vocabulary, grammar, speaking"),
  5: ("Lesson B extension", "Lesson B extension + Listening/Reading/Writing + Speaking", "Listening, speaking, reading/writing"),
}

def parse_units(value: str) -> set[int]:
    units: set[int] = set()
    for part in value.split(','):
        part = part.strip()
        if not part:
            continue
        if '-' in part:
            a, b = [int(x) for x in part.split('-', 1)]
            units.update(range(a, b + 1))
        else:
            units.add(int(part))
    bad = sorted(u for u in units if u not in ROWS)
    if bad:
        raise SystemExit(f"Only units 4-12 are supported. Invalid: {bad}")
    return units

def filename(unit:int, local:int, global_class:int) -> str:
    return f"unit-{unit:02d}-local-class-{local:02d}-global-class-{global_class:02d}-class-pack-unit-{unit:02d}-class-{global_class:02d}.md"

def source_status(text:str, bs:int, be:int, ps:int, pe:int) -> str:
    expected = [f"BOOK_PAGE {bs}", f"BOOK_PAGE {be}", f"PDF_PAGE {ps}", f"PDF_PAGE {pe}"]
    missing = [m for m in expected if m not in text]
    if not missing:
        return "Indexed source markers are present for the expected page range."
    return "Source extraction blocker: expected page marker(s) not found in existing extracted content: " + "; ".join(missing) + ". Do not invent missing page text."

def contract(unit:int, local:int, global_class:int, bs:int, be:int, ps:int, pe:int, text:str) -> str:
    lesson, sections, skill = PROFILES[local]
    block = f"""{START}
### Active class teaching contract
- Active class: Unit {unit}, local class {local}, global class {global_class}
- Lesson title: Unit {unit} {lesson}
- Active class book pages: {bs}-{be}
- Active class PDF pages: {ps}-{pe}
- Active class section names: {sections}
- Active class skill focus: {skill}
- Active class grammar focus: Extract exact grammar focus from Unit {unit} {lesson} indexed pages; do not infer unindexed wording.
- Active class vocabulary focus: Extract vocabulary from Unit {unit} {lesson} indexed pages; recycle only confirmed unit vocabulary.
- Active class functions: Teach from the indexed page range, then ask controlled practice before advancing.
- Active class target structures: Use the target language from the indexed page range. Do not invent structures outside the class pack.
- Expected learner production: Controlled and personalized answers based on the indexed Student Book prompts.
- Source status: {source_status(text, bs, be, ps, pe)}

### Safety rule
Preserve the existing extracted Student Book content exactly as indexed. Do not fabricate missing page text, transcript text, answer keys, audio scripts, or exercises.
{END}
"""
    return block

def insert_or_replace(text:str, block:str) -> str:
    pattern = re.compile(re.escape(START) + r".*?" + re.escape(END) + r"\n?", re.S)
    if pattern.search(text):
        return pattern.sub(block + "\n", text, count=1)
    anchor = "Teacher instruction: Use this file as the primary source for this exact class. Do not substitute content from another class.\n"
    if anchor in text:
        return text.replace(anchor, anchor + "\n" + block + "\n", 1)
    if "\n---\n" in text:
        return text.replace("\n---\n", "\n" + block + "\n---\n", 1)
    return block + "\n" + text

def patch_unit(unit:int, check:bool) -> tuple[int,int,int]:
    checked = changed = missing = 0
    for global_class, local, bs, be, ps, pe in ROWS[unit]:
        checked += 1
        path = PACK_DIR / filename(unit, local, global_class)
        if not path.exists():
            missing += 1
            print(f"missing: {path.relative_to(ROOT)}")
            continue
        original = path.read_text(encoding="utf-8")
        patched = insert_or_replace(original, contract(unit, local, global_class, bs, be, ps, pe, original))
        if patched != original:
            changed += 1
            if not check:
                path.write_text(patched, encoding="utf-8")
            print(f"patched: {path.relative_to(ROOT)}")
        else:
            print(f"current: {path.relative_to(ROOT)}")
    return checked, changed, missing

def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--units", required=True)
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    total_checked = total_changed = total_missing = 0
    for unit in sorted(parse_units(args.units)):
        checked, changed, missing = patch_unit(unit, args.check)
        total_checked += checked; total_changed += changed; total_missing += missing
    print(f"classes_checked={total_checked} classes_changed={total_changed} missing_files={total_missing} mode={'check' if args.check else 'write'}")
    return 1 if args.check and total_changed else 0

if __name__ == "__main__":
    raise SystemExit(main())
