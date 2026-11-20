// Plain-language labels for enquiry outcomes, used in partner exports.

const outcomeLabels: Record<string, string> = {
  deal_made: 'Deal made',
  no_deal: 'No deal',
};

const dealValueLabels: Record<string, string> = {
  under_5k: 'Under R5 000',
  '5k_50k': 'R5 000 to R50 000',
  '50k_250k': 'R50 000 to R250 000',
  over_250k: 'Over R250 000',
  prefer_not_to_say: 'Not shared',
};

export function outcomeLabel(outcome: string | null | undefined): string {
  return outcome ? outcomeLabels[outcome] ?? outcome : '';
}

export function dealValueLabel(band: string | null | undefined): string {
  return band ? dealValueLabels[band] ?? band : '';
}
