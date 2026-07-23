---
name: spreadsheet-export
description: Formats tabular analysis results into a styled .xlsx file (bold headers, auto-sized columns) instead of a plain CSV. Use this whenever the user's request produces tabular data and asks for (or would benefit from) a spreadsheet deliverable rather than raw text or a CSV.
---

# Spreadsheet Export

Use `export_xlsx.py` (in this skill's directory) to turn a list of rows into a styled `.xlsx` file rather than writing a `openpyxl` workbook from scratch.

## Usage

```
python export_xlsx.py <output_path.xlsx> <input_data.json>
```

`input_data.json` must be a JSON object of the shape `{"headers": string[], "rows": (string | number)[][]}`. The script bolds the header row and auto-sizes every column to its widest cell.

Write the row data as JSON, run the script, and the resulting `.xlsx` file is ready to hand back to the user.
