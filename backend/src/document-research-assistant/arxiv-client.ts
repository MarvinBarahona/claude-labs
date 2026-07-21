export interface ArxivPaper {
  arxivId: string;
  title: string;
  authors: string[];
  summary: string;
  pdfUrl: string;
  pdfBytes: Buffer;
}

/** DI token every consumer depends on instead of the concrete arXiv Atom API. */
export abstract class ArxivClient {
  abstract getPaper(arxivId: string): Promise<ArxivPaper>;
}
