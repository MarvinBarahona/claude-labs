import nock from 'nock';

export const ARXIV_ATOM_BASE_URL = 'https://export.arxiv.org';

export interface ArxivFixtureEntry {
  id?: string;
  title: string;
  summary: string;
  authors: string[];
  pdfUrl: string;
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function buildArxivAtomXml(entry: ArxivFixtureEntry): string {
  const authorsXml = entry.authors
    .map((name) => `<author><name>${escapeXml(name)}</name></author>`)
    .join('');
  return `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <entry>
    <id>${escapeXml(entry.id ?? 'http://arxiv.org/abs/0000.00000v1')}</id>
    <title>${escapeXml(entry.title)}</title>
    <summary>${escapeXml(entry.summary)}</summary>
    ${authorsXml}
    <link title="pdf" href="${escapeXml(entry.pdfUrl)}" rel="related" type="application/pdf"/>
  </entry>
</feed>`;
}

/** arXiv's API replies 200 even for an unrecognized ID — a single "Error" entry instead of a real one. */
export function buildArxivAtomErrorXml(message: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <entry>
    <id>http://arxiv.org/api/errors#${escapeXml(message)}</id>
    <title>Error</title>
    <summary>${escapeXml(message)}</summary>
  </entry>
</feed>`;
}

export function mockArxivQuery(idList: string, xml: string): nock.Scope {
  return nock(ARXIV_ATOM_BASE_URL)
    .get('/api/query')
    .query({ id_list: idList })
    .reply(200, xml, { 'Content-Type': 'application/atom+xml' });
}

export function mockArxivQueryServerError(idList: string): nock.Scope {
  return nock(ARXIV_ATOM_BASE_URL)
    .get('/api/query')
    .query({ id_list: idList })
    .reply(500, 'Internal Server Error');
}

export function mockArxivPdf(pdfUrl: string, bytes: Buffer): nock.Scope {
  const url = new URL(pdfUrl);
  return nock(url.origin)
    .get(url.pathname)
    .reply(200, bytes, { 'Content-Type': 'application/pdf' });
}
