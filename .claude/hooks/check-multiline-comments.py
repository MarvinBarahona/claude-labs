import json
import os
import re
import sys

CODE_EXTS = (
    ".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs",
    ".go", ".java", ".c", ".cpp", ".h", ".hpp", ".cs", ".rs", ".kt", ".swift",
)

STRING_RE = re.compile(
    r"'(?:\\.|[^'\\\n])*'"
    r"|\"(?:\\.|[^\"\\\n])*\""
    r"|`(?:\\.|[^`\\])*`"
)
BLOCK_COMMENT_RE = re.compile(r"/\*\*?.*?\*/", re.S)
LINE_COMMENT_RE = re.compile(r"//[^\n]*")


def _blank(match):
    s = match.group(0)
    return "".join(c if c == "\n" else "x" for c in s)


def main():
    try:
        payload = json.load(sys.stdin)
    except Exception:
        return

    tool_input = payload.get("tool_input") or {}
    tool_response = payload.get("tool_response") or {}
    file_path = tool_input.get("file_path") or tool_response.get("filePath")
    if not file_path or not file_path.endswith(CODE_EXTS):
        return
    if not os.path.isfile(file_path):
        return

    try:
        with open(file_path, "r", encoding="utf-8", errors="ignore") as f:
            text = f.read()
    except Exception:
        return

    # String/template literal contents can contain stray /* */ or // sequences
    # (e.g. glob patterns like '**/*.ts') that aren't real comments — blank them
    # out (preserving newlines, so line numbers and match offsets stay valid)
    # before scanning for comments.
    masked = STRING_RE.sub(_blank, text)

    found = []
    for m in BLOCK_COMMENT_RE.finditer(masked):
        line_no = text.count("\n", 0, m.start()) + 1
        label = "multi-line block comment" if "\n" in m.group(0) else "block comment"
        found.append((m.start(), f"line {line_no}: {label}"))

    # Don't let a block comment's own text (e.g. a "// like this" example inside
    # a /* */ comment) get double-counted as a line comment too.
    masked = BLOCK_COMMENT_RE.sub(_blank, masked)
    for m in LINE_COMMENT_RE.finditer(masked):
        line_no = text.count("\n", 0, m.start()) + 1
        found.append((m.start(), f"line {line_no}: // comment"))

    if not found:
        return

    found.sort(key=lambda item: item[0])
    violations = [label for _, label in found]

    reason = (
        f"{file_path} has {len(violations)} code comment(s) — "
        + "; ".join(violations[:5])
        + (", ..." if len(violations) > 5 else "")
        + ". Per the no-comments-for-obvious-facts rule: only keep a comment if it "
        + "explains a non-obvious WHY; condense or remove anything else."
    )
    print(json.dumps({"decision": "block", "reason": reason}))


if __name__ == "__main__":
    main()
