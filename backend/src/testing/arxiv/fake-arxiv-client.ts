import {
  ArxivClient,
  ArxivPaper,
} from '../../document-research-assistant/arxiv-client';

const DEFAULT_PAPER: ArxivPaper = {
  arxivId: 'fake.0001',
  title: 'Fake Paper: A Fabricated Study of Nothing in Particular',
  authors: ['Fake Author'],
  summary:
    'This is fabricated fake-mode data — no real arXiv call was made. It stands in for a real paper abstract.',
  pdfUrl: 'https://arxiv.org/pdf/fake.0001',
  pdfBytes: Buffer.from('%PDF-1.4 fake-mode canned PDF bytes, not a real PDF'),
};

/** Test double for `ArxivClient`; see docs/shared/test-doubles.md. arXiv data is naturally static per real ID — canned by default, ignoring the requested ID, same pattern as `FakeGithubClient`. */
export class FakeArxivClient extends ArxivClient {
  private paper: ArxivPaper = DEFAULT_PAPER;

  setPaper(paper: ArxivPaper): this {
    this.paper = paper;
    return this;
  }

  getPaper(): Promise<ArxivPaper> {
    return Promise.resolve(this.paper);
  }
}
