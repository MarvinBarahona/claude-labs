import { ParagraphsForTurnPipe } from './paragraphs-for-turn.pipe';
import type { TranscriptTurn } from './document-research-assistant';

describe('ParagraphsForTurnPipe', () => {
  const turns: readonly TranscriptTurn[] = [
    { question: 'q1', paragraphs: [{ text: 'a1', citations: [] }] },
    { question: 'q2', paragraphs: null },
  ];

  it('returns the paragraphs for the turn at the given index', () => {
    const pipe = new ParagraphsForTurnPipe();
    expect(pipe.transform(turns, 0)).toEqual([{ text: 'a1', citations: [] }]);
  });

  it('returns null when the turn at the given index has no paragraphs yet', () => {
    const pipe = new ParagraphsForTurnPipe();
    expect(pipe.transform(turns, 1)).toBeNull();
  });

  it('returns null when the index is out of range', () => {
    const pipe = new ParagraphsForTurnPipe();
    expect(pipe.transform(turns, 5)).toBeNull();
  });
});
