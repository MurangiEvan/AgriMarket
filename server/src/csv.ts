// Builds CSV files for partners (CRM, AgriSMME, procurement programmes) to import.
type Cell = string | number | boolean | Date | null | undefined;

// Spreadsheet apps run cells that start with = + - @ (or a tab/carriage return) as formulas.
// Seller-entered text such as a business name must never be able to do that.
const FORMULA_START = /^[=+\-@\t\r]/;

export function csvCell(value: Cell): string {
  if (value === null || value === undefined) return '';
  let text = value instanceof Date ? value.toISOString() : String(value);
  if (typeof value === 'string' && FORMULA_START.test(text)) text = `'${text}`;
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function toCsv(header: string[], rows: Cell[][]): string {
  // The byte-order mark makes Excel open the file as UTF-8 (names such as "Ekurhuleni Agri-Hub" and accents).
  return `﻿${[header, ...rows].map((row) => row.map(csvCell).join(',')).join('\r\n')}\r\n`;
}
