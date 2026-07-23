export interface WikimediaImage {
  url: string;
  title: string;
  mediaType: string;
  widthPx: number;
  heightPx: number;
  bytes: Buffer;
}

/** DI token every consumer depends on instead of the concrete Wikimedia Commons API. */
export abstract class WikimediaClient {
  abstract searchImages(
    query: string,
    count: number,
  ): Promise<WikimediaImage[]>;
}
