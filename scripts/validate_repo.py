#!/usr/bin/env python3
"""Repo hygiene checks: skill/agent frontmatter and internal markdown links.

Stdlib only — frontmatter here is flat key: value pairs, no nested YAML.
"""
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent

errors = []


def parse_frontmatter(path: pathlib.Path) -> dict:
    text = path.read_text()
    if not text.startswith("---\n"):
        raise ValueError("missing opening --- frontmatter delimiter")
    end = text.find("\n---", 4)
    if end == -1:
        raise ValueError("missing closing --- frontmatter delimiter")
    block = text[4:end]
    fields = {}
    key = None
    for line in block.splitlines():
        if re.match(r"^[A-Za-z_][A-Za-z0-9_]*:", line):
            key, _, value = line.partition(":")
            fields[key.strip()] = value.strip()
        elif key and line.startswith(("  ", "\t")):
            fields[key] += " " + line.strip()
    return fields


def check_skills():
    for skill_md in sorted(ROOT.glob(".agents/skills/*/SKILL.md")):
        dir_name = skill_md.parent.name
        rel = skill_md.relative_to(ROOT)
        try:
            fm = parse_frontmatter(skill_md)
        except ValueError as e:
            errors.append(f"{rel}: {e}")
            continue
        if not fm.get("name"):
            errors.append(f"{rel}: missing 'name' in frontmatter")
        elif fm["name"] != dir_name:
            errors.append(f"{rel}: name '{fm['name']}' != directory '{dir_name}'")
        if not fm.get("description"):
            errors.append(f"{rel}: missing 'description' in frontmatter")


def check_agents():
    agents_dir = ROOT / ".claude" / "agents"
    if not agents_dir.is_dir():
        return
    for agent_md in sorted(agents_dir.glob("*.md")):
        stem = agent_md.stem
        rel = agent_md.relative_to(ROOT)
        try:
            fm = parse_frontmatter(agent_md)
        except ValueError as e:
            errors.append(f"{rel}: {e}")
            continue
        if not fm.get("name"):
            errors.append(f"{rel}: missing 'name' in frontmatter")
        elif fm["name"] != stem:
            errors.append(f"{rel}: name '{fm['name']}' != filename '{stem}'")
        if not fm.get("description"):
            errors.append(f"{rel}: missing 'description' in frontmatter")
        if not fm.get("tools"):
            errors.append(f"{rel}: missing 'tools' in frontmatter")


LINK_CHECK_EXCLUDES = (".git", ".agents/skills", ".claude/skills")


def check_internal_links():
    link_re = re.compile(r"\[[^\]]*\]\(([^)]+)\)")
    for md in sorted(ROOT.rglob("*.md")):
        rel_posix = md.relative_to(ROOT).as_posix()
        if any(rel_posix == excl or rel_posix.startswith(excl + "/") for excl in LINK_CHECK_EXCLUDES):
            continue
        text = md.read_text(errors="ignore")
        for match in link_re.finditer(text):
            target = match.group(1).split("#", 1)[0].strip()
            if not target or target.startswith(("http://", "https://", "mailto:")):
                continue
            resolved = (md.parent / target).resolve()
            if not resolved.exists():
                errors.append(f"{md.relative_to(ROOT)}: broken relative link '{target}'")


def main():
    check_skills()
    check_agents()
    check_internal_links()
    if errors:
        print(f"Found {len(errors)} issue(s):\n")
        for e in errors:
            print(f"  - {e}")
        sys.exit(1)
    print("Repo hygiene checks passed.")


if __name__ == "__main__":
    main()
