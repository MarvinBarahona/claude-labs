import { Injectable } from '@nestjs/common';
import axios, { AxiosInstance } from 'axios';
import { XMLParser } from 'fast-xml-parser';
import { ExternalApiError } from '../shared/api-error-handling';
import { ArxivClient, ArxivPaper } from './arxiv-client';

const ATOM_API_BASE_URL = 'https://export.arxiv.org';

interface ArxivAtomLink {
  '@_href': string;
  '@_title'?: string;
  '@_rel'?: string;
  '@_type'?: string;
}

interface ArxivAtomAuthor {
  name: string;
}

export interface ArxivAtomEntry {
  id: string;
  title: string;
  summary: string;
  author?: ArxivAtomAuthor | ArxivAtomAuthor[];
  link?: ArxivAtomLink | ArxivAtomLink[];
}

/** Shape `export.arxiv.org/api/query` actually returns (parsed from Atom XML) — what this file's own `nock` fixtures build. */
export interface ArxivAtomFeed {
  feed?: {
    entry?: ArxivAtomEntry | ArxivAtomEntry[];
  };
}

/** Accepts a bare ID ("2301.00234"), a bare ID with version ("2301.00234v2"), or a full arxiv.org abs/pdf URL — extracts the bare ID either way. */
export function normalizeArxivId(input: string): string {
  const trimmed = input.trim();
  const withScheme = /^https?:\/\//i.test(trimmed)
    ? trimmed
    : trimmed.includes('arxiv.org')
      ? `https://${trimmed}`
      : null;

  if (withScheme) {
    try {
      const url = new URL(withScheme);
      const match = url.pathname.match(/\/(?:abs|pdf)\/(.+)$/);
      if (match) {
        return decodeURIComponent(match[1]).replace(/\.pdf$/i, '');
      }
    } catch {
      // not a parseable URL — fall through to bare-ID handling below
    }
  }

  return trimmed.replace(/\.pdf$/i, '');
}

function toArray<T>(value: T | T[] | undefined): T[] {
  if (value === undefined) {
    return [];
  }
  return Array.isArray(value) ? value : [value];
}

function cleanText(value: string | undefined): string {
  return (value ?? '').replace(/\s+/g, ' ').trim();
}

@Injectable()
export class RealArxivClient extends ArxivClient {
  private readonly http: AxiosInstance = axios.create({
    baseURL: ATOM_API_BASE_URL,
  });
  private readonly xmlParser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
  });

  async getPaper(arxivId: string): Promise<ArxivPaper> {
    const normalizedId = normalizeArxivId(arxivId);
    try {
      const { data: xml } = await this.http.get<string>('/api/query', {
        params: { id_list: normalizedId },
      });
      const entry = this.extractEntry(xml, normalizedId);
      const pdfUrl = this.extractPdfUrl(entry, normalizedId);
      const { data: pdfBytes } = await axios.get<ArrayBuffer>(pdfUrl, {
        responseType: 'arraybuffer',
      });

      return {
        arxivId: normalizedId,
        title: cleanText(entry.title),
        authors: toArray(entry.author).map((author) => cleanText(author.name)),
        summary: cleanText(entry.summary),
        pdfUrl,
        pdfBytes: Buffer.from(pdfBytes),
      };
    } catch (error) {
      throw toExternalApiError(error);
    }
  }

  private extractEntry(xml: string, normalizedId: string): ArxivAtomEntry {
    const parsed = this.xmlParser.parse(xml) as ArxivAtomFeed;
    const entry = toArray(parsed.feed?.entry)[0];
    // arXiv's API replies 200 even for an unrecognized ID, with a single error entry instead of a real one.
    if (
      !entry ||
      (typeof entry.id === 'string' && entry.id.includes('/api/errors'))
    ) {
      throw new Error(`No paper found for arXiv ID "${normalizedId}"`);
    }
    return entry;
  }

  private extractPdfUrl(entry: ArxivAtomEntry, normalizedId: string): string {
    const pdfLink = toArray(entry.link).find(
      (link) => link['@_title'] === 'pdf',
    );
    if (!pdfLink) {
      throw new Error(`No PDF link found for arXiv ID "${normalizedId}"`);
    }
    return pdfLink['@_href'];
  }
}

function toExternalApiError(error: unknown): ExternalApiError {
  const message = error instanceof Error ? error.message : String(error);
  return new ExternalApiError('arxiv', message);
}
