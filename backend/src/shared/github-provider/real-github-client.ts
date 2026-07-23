import { Injectable } from '@nestjs/common';
import axios, { AxiosInstance } from 'axios';
import { AppConfigService } from '../config/config.service';
import { ExternalApiError } from '../api-error-handling';
import { GithubClient } from './github-client';
import {
  GithubCommit,
  GithubFileTreeEntry,
  GithubIssue,
  GithubRelease,
} from './github-provider.types';

/** Shapes GitHub's REST API actually returns — this and the below are what the http-fixtures for this host build. */
export interface GithubIssueResponse {
  number: number;
  title: string;
  state: 'open' | 'closed';
  body: string | null;
  user: { login: string };
  created_at: string;
  html_url: string;
}

export interface GithubCommitResponse {
  sha: string;
  commit: { message: string; author: { name: string; date: string } };
  html_url: string;
}

export interface GithubReleaseResponse {
  tag_name: string;
  name: string | null;
  body: string | null;
  published_at: string;
  html_url: string;
}

export interface GithubRepoResponse {
  default_branch: string;
}

export interface GithubTreeResponse {
  tree: Array<{ path: string; type: 'blob' | 'tree'; sha: string }>;
}

/** GitHub's Contents API always returns `content` base64-encoded (with embedded newlines), regardless of the file's actual text/binary nature. */
export interface GithubContentResponse {
  content: string;
  encoding: string;
}

@Injectable()
export class RealGithubClient extends GithubClient {
  private readonly http: AxiosInstance;
  private readonly repoPath: string;

  constructor(config: AppConfigService) {
    super();
    this.repoPath = config.githubTargetRepo;
    this.http = axios.create({
      baseURL: 'https://api.github.com',
      headers: config.githubToken
        ? { Authorization: `Bearer ${config.githubToken}` }
        : undefined,
    });
  }

  async getIssues(
    params: { state?: 'open' | 'closed' | 'all'; perPage?: number } = {},
  ): Promise<GithubIssue[]> {
    try {
      const { data } = await this.http.get<GithubIssueResponse[]>(
        `/repos/${this.repoPath}/issues`,
        {
          params: { state: params.state, per_page: params.perPage },
        },
      );
      return data.map((issue) => ({
        number: issue.number,
        title: issue.title,
        state: issue.state,
        body: issue.body,
        user: issue.user.login,
        createdAt: issue.created_at,
        url: issue.html_url,
      }));
    } catch (error) {
      throw toExternalApiError(error);
    }
  }

  async getCommits(params: { perPage?: number } = {}): Promise<GithubCommit[]> {
    try {
      const { data } = await this.http.get<GithubCommitResponse[]>(
        `/repos/${this.repoPath}/commits`,
        {
          params: { per_page: params.perPage },
        },
      );
      return data.map((commit) => ({
        sha: commit.sha,
        message: commit.commit.message,
        author: commit.commit.author.name,
        date: commit.commit.author.date,
        url: commit.html_url,
      }));
    } catch (error) {
      throw toExternalApiError(error);
    }
  }

  async getReleases(
    params: { perPage?: number } = {},
  ): Promise<GithubRelease[]> {
    try {
      const { data } = await this.http.get<GithubReleaseResponse[]>(
        `/repos/${this.repoPath}/releases`,
        {
          params: { per_page: params.perPage },
        },
      );
      return data.map((release) => ({
        tagName: release.tag_name,
        name: release.name,
        body: release.body,
        publishedAt: release.published_at,
        url: release.html_url,
      }));
    } catch (error) {
      throw toExternalApiError(error);
    }
  }

  async getFileTree(): Promise<GithubFileTreeEntry[]> {
    try {
      const { data: repo } = await this.http.get<GithubRepoResponse>(
        `/repos/${this.repoPath}`,
      );
      const { data: tree } = await this.http.get<GithubTreeResponse>(
        `/repos/${this.repoPath}/git/trees/${repo.default_branch}`,
        { params: { recursive: 1 } },
      );
      return tree.tree.map((entry) => ({
        path: entry.path,
        type: entry.type,
        sha: entry.sha,
      }));
    } catch (error) {
      throw toExternalApiError(error);
    }
  }

  async getFileContent(
    path: string,
  ): Promise<{ content: string; encoding: 'utf-8' | 'base64' }> {
    try {
      const encodedPath = path
        .split('/')
        .map((segment) => encodeURIComponent(segment))
        .join('/');
      const { data } = await this.http.get<GithubContentResponse>(
        `/repos/${this.repoPath}/contents/${encodedPath}`,
      );
      if (typeof data.content !== 'string') {
        throw new Error(`"${path}" is not a readable file`);
      }
      const raw = Buffer.from(data.content, 'base64');
      try {
        // `fatal: true` is what makes this throw on a byte sequence that isn't valid UTF-8 (a binary file) — Buffer#toString('utf-8') would silently replace invalid bytes instead.
        const text = new TextDecoder('utf-8', { fatal: true }).decode(raw);
        return { content: text, encoding: 'utf-8' };
      } catch {
        return { content: data.content.replace(/\n/g, ''), encoding: 'base64' };
      }
    } catch (error) {
      throw toExternalApiError(error);
    }
  }
}

function toExternalApiError(error: unknown): ExternalApiError {
  const message = error instanceof Error ? error.message : String(error);
  return new ExternalApiError('github', message);
}
