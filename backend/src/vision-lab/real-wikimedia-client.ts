import { Injectable } from '@nestjs/common';
import axios, { AxiosInstance } from 'axios';
import { ExternalApiError } from '../shared/api-error-handling';
import { WikimediaClient, WikimediaImage } from './wikimedia-client';

const COMMONS_BASE_URL = 'https://commons.wikimedia.org';
const FILE_NAMESPACE = 6;

interface CommonsImageInfo {
  url: string;
  width: number;
  height: number;
  mime: string;
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
        const { data: bytes } = await axios.get<ArrayBuffer>(info.url, {
          responseType: 'arraybuffer',
        });
        images.push({
          url: info.url,
          title: page.title,
          mediaType: info.mime,
          widthPx: info.width,
          heightPx: info.height,
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
