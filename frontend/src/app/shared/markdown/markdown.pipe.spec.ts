import { MarkdownPipe } from './markdown.pipe';

describe('MarkdownPipe', () => {
  it('renders **bold** markdown into a <strong> tag', () => {
    const pipe = new MarkdownPipe();
    expect(pipe.transform('**bold**')).toContain('<strong>bold</strong>');
  });
});
