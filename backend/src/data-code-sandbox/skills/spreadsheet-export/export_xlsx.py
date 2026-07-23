import json
import sys

from openpyxl import Workbook
from openpyxl.styles import Font


def main(output_path: str, input_path: str) -> None:
    with open(input_path) as f:
        data = json.load(f)

    workbook = Workbook()
    sheet = workbook.active

    sheet.append(data["headers"])
    for cell in sheet[1]:
        cell.font = Font(bold=True)

    for row in data["rows"]:
        sheet.append(row)

    for column_cells in sheet.columns:
        width = max(len(str(cell.value)) for cell in column_cells if cell.value is not None)
        sheet.column_dimensions[column_cells[0].column_letter].width = width + 2

    workbook.save(output_path)


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
