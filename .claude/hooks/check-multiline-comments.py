import json
import os
import re
import sys

CODE_EXTS = (
    ".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs",
    ".go", ".java", ".c", ".cpp", ".h", ".hpp", ".cs", ".rs", ".kt", ".swift",
)

BLOCK_COMMENT_RE = re.compile(r"/\*\*?.*?\*/", re.S)
LINE_COMMENT_RUN_RE = re.compile(r"(?:^[ \t]*//[^\n]*\n){2,}", re.M)


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

    violations = []
    for m in BLOCK_COMMENT_RE.finditer(text):
        if "\n" in m.group(0):
            line_no = text.count("\n", 0, m.start()) + 1
            violations.append(f"line {line_no}: multi-line block comment")
    for m in LINE_COMMENT_RUN_RE.finditer(text):
        line_no = text.count("\n", 0, m.start()) + 1
        violations.append(f"line {line_no}: consecutive // comment lines")

    if not violations:
        return

    reason = (
        f"{file_path} has {len(violations)} multi-line comment block(s) — "
        + "; ".join(violations[:5])
        + (", ..." if len(violations) > 5 else "")
        + ". Per the no-multi-line-comments rule: condense each to one short line, or remove it."
    )
    print(json.dumps({"decision": "block", "reason": reason}))


if __name__ == "__main__":
    main()
