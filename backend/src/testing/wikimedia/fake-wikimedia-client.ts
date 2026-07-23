import {
  WikimediaClient,
  WikimediaImage,
} from '../../vision-lab/wikimedia-client';

const DEFAULT_IMAGES: WikimediaImage[] = [
  {
    url: 'https://upload.wikimedia.org/wikipedia/commons/fake/Fake_Image_1.jpg',
    title: 'File:Fake Image 1.jpg',
    mediaType: 'image/jpeg',
    widthPx: 1600,
    heightPx: 1200,
    bytes: Buffer.from(
      'fake-mode canned JPEG bytes 1 — no real Wikimedia call was made',
    ),
  },
  {
    url: 'https://upload.wikimedia.org/wikipedia/commons/fake/Fake_Image_2.jpg',
    title: 'File:Fake Image 2.jpg',
    mediaType: 'image/jpeg',
    widthPx: 3200,
    heightPx: 1800,
    bytes: Buffer.from(
      'fake-mode canned JPEG bytes 2 — no real Wikimedia call was made',
    ),
  },
  {
    url: 'https://upload.wikimedia.org/wikipedia/commons/fake/Fake_Image_3.jpg',
    title: 'File:Fake Image 3.jpg',
    mediaType: 'image/jpeg',
    widthPx: 1200,
    heightPx: 1600,
    bytes: Buffer.from(
      'fake-mode canned JPEG bytes 3 — no real Wikimedia call was made',
    ),
  },
  {
    url: 'https://upload.wikimedia.org/wikipedia/commons/fake/Fake_Image_4.jpg',
    title: 'File:Fake Image 4.jpg',
    mediaType: 'image/jpeg',
    widthPx: 800,
    heightPx: 600,
    bytes: Buffer.from(
      'fake-mode canned JPEG bytes 4 — no real Wikimedia call was made',
    ),
  },
];

/** Test double for `WikimediaClient`; see docs/shared/test-doubles.md. Canned by default (ignoring the requested query), same pattern as `FakeArxivClient` — image #2 is over 2000px wide, so the default set alone exercises the dimension-cap path. */
export class FakeWikimediaClient extends WikimediaClient {
  private images: WikimediaImage[] = DEFAULT_IMAGES;

  setImages(images: WikimediaImage[]): this {
    this.images = images;
    return this;
  }

  searchImages(query: string, count: number): Promise<WikimediaImage[]> {
    return Promise.resolve(this.images.slice(0, count));
  }
}
