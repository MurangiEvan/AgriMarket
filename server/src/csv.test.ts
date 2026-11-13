import assert from 'node:assert/strict';
import test from 'node:test';

import { csvCell, toCsv } from './csv.js';

test('CSV cells are quoted when they contain commas, quotes or line breaks', () => {
  assert.equal(csvCell('Tomatoes by Thabo'), 'Tomatoes by Thabo');
  assert.equal(csvCell('Tzaneen, Limpopo'), '"Tzaneen, Limpopo"');
  assert.equal(csvCell('The "best" avos'), '"The ""best"" avos"');
  assert.equal(csvCell(null), '');
  assert.equal(csvCell(true), 'true');
  assert.equal(csvCell(12), '12');
});

test('seller text cannot become a spreadsheet formula', () => {
  assert.equal(csvCell('=HYPERLINK("http://evil.example")'), '"\'=HYPERLINK(""http://evil.example"")"');
  assert.equal(csvCell('+27821234567'), "'+27821234567");
  assert.equal(csvCell('@SUM(A1)'), "'@SUM(A1)");
  assert.equal(csvCell(-5), '-5');
});

test('a CSV file has a UTF-8 marker, a header and one line per row', () => {
  const csv = toCsv(['Name', 'Town'], [['Thabo Farm', 'Tzaneen'], ['Maake Veg', null]]);
  assert.ok(csv.startsWith('﻿Name,Town\r\n'));
  assert.equal(csv.trim().split('\r\n').length, 3);
});
