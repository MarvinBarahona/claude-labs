import { Injectable } from '@nestjs/common';
import axios, { AxiosInstance } from 'axios';
import { ExternalApiError } from '../shared/api-error-handling';
import { WikimediaClient, WikimediaImage } from './wikimedia-client';

const COMMONS_BASE_URL = 'https://commons.wikimedia.org';
const FILE_NAMESPACE = 6;
// Required by Wikimedia's User-Agent policy (https://meta.wikimedia.org/wiki/User-Agent_policy) — requests without one, or with axios's default, get a 403.
const USER_AGENT =
  'claude-labs/1.0 (https://github.com/MarvinBarahona/claude-labs)';
// Commons originals can run tens of MB; requesting this thumbnail width keeps bytes small while staying just above the 2000px multi-image cap so the dimension-cap demo still triggers.
const THUMBNAIL_TARGET_WIDTH_PX = 2200;

interface CommonsImageInfo {
  url: string;
  width: number;
  height: number;
  mime: string;
  thumburl?: string;
  thumbwidth?: number;
  thumbheight?: number;
}

interface CommonsPage {
  title: string;
  imageinfo?: CommonsImageInfo[];
}

interface CommonsSearchResponse {
  query?: {
    pages?: Record<string, CommonsPage>;
  };
}

@Injectable()
export class RealWikimediaClient extends WikimediaClient {
  private readonly http: AxiosInstance = axios.create({
    baseURL: COMMONS_BASE_URL,
    headers: { 'User-Agent': USER_AGENT },
  });

  async searchImages(query: string, count: number): Promise<WikimediaImage[]> {
    try {
      const { data } = await this.http.get<CommonsSearchResponse>(
        '/w/api.php',
        {
          params: {
            action: 'query',
            format: 'json',
            generator: 'search',
            gsrsearch: query,
            gsrnamespace: FILE_NAMESPACE,
            gsrlimit: count,
            prop: 'imageinfo',
            iiprop: 'url|size|mime',
            iiurlwidth: THUMBNAIL_TARGET_WIDTH_PX,
          },
        },
      );

      const pages = Object.values(data.query?.pages ?? {}).filter(
        (page): page is CommonsPage & { imageinfo: CommonsImageInfo[] } =>
          Array.isArray(page.imageinfo) && page.imageinfo.length > 0,
      );

      const images: WikimediaImage[] = [];
      for (const page of pages) {
        const info = page.imageinfo[0];
        const fetchUrl = info.thumburl ?? info.url;
        const { data: bytes } = await this.http.get<ArrayBuffer>(fetchUrl, {
          responseType: 'arraybuffer',
        });
        images.push({
          url: fetchUrl,
          title: page.title,
          mediaType: info.mime,
          widthPx: info.thumbwidth ?? info.width,
          heightPx: info.thumbheight ?? info.height,
          bytes: Buffer.from(bytes),
        });
      }

      return images;
    } catch (error) {
      throw toExternalApiError(error);
    }
  }
}

function toExternalApiError(error: unknown): ExternalApiError {
  const message = error instanceof Error ? error.message : String(error);
  return new ExternalApiError('wikimedia', message);
}
