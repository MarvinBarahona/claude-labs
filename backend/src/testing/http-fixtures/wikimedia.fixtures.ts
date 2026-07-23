import nock from 'nock';

export const WIKIMEDIA_COMMONS_BASE_URL = 'https://commons.wikimedia.org';

export interface WikimediaFixtureImage {
  pageId?: number;
  title: string;
  url: string;
  width: number;
  height: number;
  mime: string;
}

export function mockWikimediaSearch(
  images: WikimediaFixtureImage[],
): nock.Scope {
  const pages: Record<string, unknown> = {};
  images.forEach((image, index) => {
    const pageId = image.pageId ?? 1000 + index;
    pages[String(pageId)] = {
      pageid: pageId,
      ns: 6,
      title: image.title,
      imageinfo: [
        {
          url: image.url,
          width: image.width,
          height: image.height,
          mime: image.mime,
        },
      ],
    };
  });

  return nock(WIKIMEDIA_COMMONS_BASE_URL)
    .get('/w/api.php')
    .query(true)
    .reply(200, { batchcomplete: '', query: { pages } });
}

export function mockWikimediaSearchServerError(): nock.Scope {
  return nock(WIKIMEDIA_COMMONS_BASE_URL)
    .get('/w/api.php')
    .query(true)
    .reply(500, 'Internal Server Error');
}

export function mockWikimediaImageDownload(
  url: string,
  bytes: Buffer,
  contentType = 'image/jpeg',
): nock.Scope {
  const parsed = new URL(url);
  return nock(parsed.origin)
    .get(parsed.pathname)
    .reply(200, bytes, { 'Content-Type': contentType });
}
