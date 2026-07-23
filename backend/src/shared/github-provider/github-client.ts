import {
  GithubCommit,
  GithubFileTreeEntry,
  GithubIssue,
  GithubRelease,
} from './github-provider.types';

/** DI token every consumer depends on instead of the concrete GitHub REST API. */
export abstract class GithubClient {
  abstract getIssues(params?: {
    state?: 'open' | 'closed' | 'all';
    perPage?: number;
  }): Promise<GithubIssue[]>;
  abstract getCommits(params?: { perPage?: number }): Promise<GithubCommit[]>;
  abstract getReleases(params?: { perPage?: number }): Promise<GithubRelease[]>;
  abstract getFileTree(): Promise<GithubFileTreeEntry[]>;
  abstract getFileContent(
    path: string,
  ): Promise<{ content: string; encoding: 'utf-8' | 'base64' }>;
}
