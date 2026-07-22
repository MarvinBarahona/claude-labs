import { renderMarkdown } from './render-markdown';

describe('renderMarkdown', () => {
  it('renders **bold** markdown into a <strong> tag', () => {
    expect(renderMarkdown('**bold**')).toContain('<strong>bold</strong>');
  });

  it('returns a plain string, not a Promise', () => {
    const result = renderMarkdown('hello');
    expect(typeof result).toBe('string');
  });
});
