import nock from 'nock';
import { useNockFixtures } from '../../testing/http-fixtures/nock-lifecycle';
import {
  GITHUB_API_BASE_URL,
  mockGithubCommits,
  mockGithubIssues,
  mockGithubNotFoundError,
  mockGithubRateLimitError,
  mockGithubReleases,
  mockGithubRepo,
  mockGithubTree,
} from '../../testing/http-fixtures/github.fixtures';
import { ExternalApiError } from '../api-error-handling';
import { AppConfigService } from '../config/config.service';
import { RealGithubClient } from './real-github-client';

function buildClient(
  overrides: Partial<
    Pick<AppConfigService, 'githubTargetRepo' | 'githubToken'>
  > = {},
): RealGithubClient {
  return new RealGithubClient({
    githubTargetRepo: 'angular/angular',
    githubToken: undefined,
    ...overrides,
  } as AppConfigService);
}

describe('RealGithubClient', () => {
  useNockFixtures();

  it('shapes a getIssues() response into the typed array', async () => {
    mockGithubIssues('angular/angular', [
      {
        number: 1,
        title: 'a title',
        state: 'open',
        body: 'a body',
        user: { login: 'someone' },
        created_at: '2026-01-01T00:00:00Z',
        html_url: 'https://github.com/angular/angular/issues/1',
      },
    ]);
    const client = buildClient();

    const issues = await client.getIssues();

    expect(issues).toEqual([
      {
        number: 1,
        title: 'a title',
        state: 'open',
        body: 'a body',
        user: 'someone',
        createdAt: '2026-01-01T00:00:00Z',
        url: 'https://github.com/angular/angular/issues/1',
      },
    ]);
  });

  it('shapes a getCommits() response into the typed array', async () => {
    mockGithubCommits('angular/angular', [
      {
        sha: 'abc123',
        commit: {
          message: 'a commit message',
          author: { name: 'someone', date: '2026-01-01T00:00:00Z' },
        },
        html_url: 'https://github.com/angular/angular/commit/abc123',
      },
    ]);
    const client = buildClient();

    const commits = await client.getCommits();

    expect(commits).toEqual([
      {
        sha: 'abc123',
        message: 'a commit message',
        author: 'someone',
        date: '2026-01-01T00:00:00Z',
        url: 'https://github.com/angular/angular/commit/abc123',
      },
    ]);
  });

  it('shapes a getReleases() response into the typed array', async () => {
    mockGithubReleases('angular/angular', [
      {
        tag_name: 'v1.0.0',
        name: 'a release',
        body: 'release notes',
        published_at: '2026-01-01T00:00:00Z',
        html_url: 'https://github.com/angular/angular/releases/tag/v1.0.0',
      },
    ]);
    const client = buildClient();

    const releases = await client.getReleases();

    expect(releases).toEqual([
      {
        tagName: 'v1.0.0',
        name: 'a release',
        body: 'release notes',
        publishedAt: '2026-01-01T00:00:00Z',
        url: 'https://github.com/angular/angular/releases/tag/v1.0.0',
      },
    ]);
  });

  it('reads default_branch from the repo endpoint, then shapes the recursive tree response', async () => {
    mockGithubRepo('angular/angular', { default_branch: 'main' });
    mockGithubTree('angular/angular', 'main', {
      tree: [{ path: 'README.md', type: 'blob', sha: 'sha1' }],
    });
    const client = buildClient();

    const tree = await client.getFileTree();

    expect(tree).toEqual([{ path: 'README.md', type: 'blob', sha: 'sha1' }]);
  });

  it("re-points every method's request path at an overridden target repo", async () => {
    const scope = mockGithubIssues('some-org/some-repo', []);
    const client = buildClient({ githubTargetRepo: 'some-org/some-repo' });

    await client.getIssues();

    expect(scope.isDone()).toBe(true);
  });

  it('sends no Authorization header when githubToken is unset', async () => {
    let capturedAuth: string | undefined;
    nock(GITHUB_API_BASE_URL)
      .get('/repos/angular/angular/issues')
      .query(true)
      .reply(function () {
        capturedAuth = this.req.headers.authorization;
        return [200, []];
      });
    const client = buildClient({ githubToken: undefined });

    await client.getIssues();

    expect(capturedAuth).toBeUndefined();
  });

  it('sends Authorization: Bearer <token> automatically when githubToken is set', async () => {
    let capturedAuth: string | undefined;
    nock(GITHUB_API_BASE_URL)
      .get('/repos/angular/angular/issues')
      .query(true)
      .reply(function () {
        capturedAuth = this.req.headers.authorization;
        return [200, []];
      });
    const client = buildClient({ githubToken: 'a-token' });

    await client.getIssues();

    expect(capturedAuth).toBe('Bearer a-token');
  });

  it('rethrows a 403 rate-limit response as a normalized ExternalApiError', async () => {
    mockGithubRateLimitError('angular/angular');
    const client = buildClient();

    const error = await client.getIssues().catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ExternalApiError);
    expect(error).toMatchObject({ source: 'github' });
  });

  it('rethrows a 404 not-found response as a normalized ExternalApiError', async () => {
    mockGithubNotFoundError('angular/angular');
    const client = buildClient();

    const error = await client.getFileTree().catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ExternalApiError);
    expect(error).toMatchObject({ source: 'github' });
  });
});
