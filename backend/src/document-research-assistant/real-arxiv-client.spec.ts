import { normalizeArxivId } from './real-arxiv-client';

describe('normalizeArxivId', () => {
  it('passes a bare ID through unchanged', () => {
    expect(normalizeArxivId('2301.00234')).toBe('2301.00234');
  });

  it('keeps a version suffix on a bare ID', () => {
    expect(normalizeArxivId('2301.00234v2')).toBe('2301.00234v2');
  });

  it('extracts the ID from a full abs URL', () => {
    expect(normalizeArxivId('https://arxiv.org/abs/2301.00234')).toBe(
      '2301.00234',
    );
  });

  it('extracts the ID from a full pdf URL, stripping the .pdf extension', () => {
    expect(normalizeArxivId('https://arxiv.org/pdf/2301.00234v1.pdf')).toBe(
      '2301.00234v1',
    );
  });

  it('extracts the ID from a protocol-less URL', () => {
    expect(normalizeArxivId('arxiv.org/abs/2301.00234')).toBe('2301.00234');
  });

  it('trims surrounding whitespace', () => {
    expect(normalizeArxivId('  2301.00234  ')).toBe('2301.00234');
  });
});
