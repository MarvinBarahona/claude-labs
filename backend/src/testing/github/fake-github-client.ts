import { GithubClient } from '../../shared/github-provider/github-client';
import {
  GithubCommit,
  GithubFileTreeEntry,
  GithubIssue,
  GithubRelease,
} from '../../shared/github-provider/github-provider.types';

const DEFAULT_ISSUES: GithubIssue[] = [
  {
    number: 1,
    title: 'Fake issue: improve documentation',
    state: 'open',
    body: 'This is fabricated fake-mode data — no real GitHub call was made.',
    user: 'fake-user',
    createdAt: '2026-01-01T00:00:00Z',
    url: 'https://github.com/angular/angular/issues/1',
  },
];

const DEFAULT_COMMITS: GithubCommit[] = [
  {
    sha: 'fake0000000000000000000000000000000000',
    message: 'Fake commit: fix a bug',
    author: 'fake-user',
    date: '2026-01-01T00:00:00Z',
    url: 'https://github.com/angular/angular/commit/fake0000000000000000000000000000000000',
  },
];

const DEFAULT_RELEASES: GithubRelease[] = [
  {
    tagName: 'v0.0.0-fake',
    name: 'Fake release',
    body: 'This is fabricated fake-mode data — no real GitHub call was made.',
    publishedAt: '2026-01-01T00:00:00Z',
    url: 'https://github.com/angular/angular/releases/tag/v0.0.0-fake',
  },
];

const DEFAULT_FILE_TREE: GithubFileTreeEntry[] = [
  { path: 'README.md', type: 'blob', sha: 'fake-readme-sha' },
  { path: 'src', type: 'tree', sha: 'fake-src-sha' },
];

/** Test double for `GithubClient`; see docs/shared/test-doubles.md. Unlike FakeAnthropicClient, GitHub data is naturally static — canned by default, no unqueued-call fallback needed. */
export class FakeGithubClient extends GithubClient {
  private issues: GithubIssue[] = DEFAULT_ISSUES;
  private commits: GithubCommit[] = DEFAULT_COMMITS;
  private releases: GithubRelease[] = DEFAULT_RELEASES;
  private fileTree: GithubFileTreeEntry[] = DEFAULT_FILE_TREE;

  setIssues(issues: GithubIssue[]): this {
    this.issues = issues;
    return this;
  }

  setCommits(commits: GithubCommit[]): this {
    this.commits = commits;
    return this;
  }

  setReleases(releases: GithubRelease[]): this {
    this.releases = releases;
    return this;
  }

  setFileTree(fileTree: GithubFileTreeEntry[]): this {
    this.fileTree = fileTree;
    return this;
  }

  getIssues(): Promise<GithubIssue[]> {
    return Promise.resolve(this.issues);
  }

  getCommits(): Promise<GithubCommit[]> {
    return Promise.resolve(this.commits);
  }

  getReleases(): Promise<GithubRelease[]> {
    return Promise.resolve(this.releases);
  }

  getFileTree(): Promise<GithubFileTreeEntry[]> {
    return Promise.resolve(this.fileTree);
  }
}
