import assert from 'node:assert/strict';
import test from 'node:test';

import { dealValueLabel, outcomeLabel } from './outcomes.js';
import { enquiryStatusSchema } from './validation.js';

test('closing an enquiry requires saying whether a deal was made', () => {
  assert.equal(enquiryStatusSchema.safeParse({ status: 'closed' }).success, false);
  assert.equal(enquiryStatusSchema.safeParse({ status: 'closed', outcome: 'no_deal' }).success, true);
  assert.equal(enquiryStatusSchema.safeParse({ status: 'closed', outcome: 'deal_made', outcomeValueBand: '5k_50k' }).success, true);
  assert.equal(enquiryStatusSchema.safeParse({ status: 'closed', outcome: 'deal_made' }).success, true);
});

test('outcomes and deal values only fit where they make sense', () => {
  assert.equal(enquiryStatusSchema.safeParse({ status: 'read' }).success, true);
  assert.equal(enquiryStatusSchema.safeParse({ status: 'responded', outcome: 'deal_made' }).success, false);
  assert.equal(enquiryStatusSchema.safeParse({ status: 'closed', outcome: 'no_deal', outcomeValueBand: 'under_5k' }).success, false);
  assert.equal(enquiryStatusSchema.safeParse({ status: 'closed', outcome: 'sold' }).success, false);
  assert.equal(enquiryStatusSchema.safeParse({ status: 'closed', outcome: 'deal_made', outcomeValueBand: '12345' }).success, false);
});

test('exports describe outcomes and deal values in plain words, never exact amounts', () => {
  assert.equal(outcomeLabel('deal_made'), 'Deal made');
  assert.equal(outcomeLabel('no_deal'), 'No deal');
  assert.equal(outcomeLabel(null), '');
  assert.equal(dealValueLabel('50k_250k'), 'R50 000 to R250 000');
  assert.equal(dealValueLabel('prefer_not_to_say'), 'Not shared');
  assert.equal(dealValueLabel(undefined), '');
});
