import { FakeGithubClient } from './fake-github-client';

describe('FakeGithubClient', () => {
  it('returns a built-in canned fixture for getIssues() when nothing is overridden', async () => {
    const client = new FakeGithubClient();
    const issues = await client.getIssues();
    expect(issues.length).toBeGreaterThan(0);
  });

  it('returns the overridden data after setIssues()', async () => {
    const client = new FakeGithubClient();
    const overridden = [
      {
        number: 99,
        title: 'overridden issue',
        state: 'open' as const,
        body: null,
        user: 'someone',
        createdAt: '2026-01-01T00:00:00Z',
        url: 'https://github.com/x/y/issues/99',
      },
    ];

    client.setIssues(overridden);

    expect(await client.getIssues()).toEqual(overridden);
  });

  it('returns a built-in canned fixture for getCommits() when nothing is overridden', async () => {
    const client = new FakeGithubClient();
    const commits = await client.getCommits();
    expect(commits.length).toBeGreaterThan(0);
  });

  it('returns the overridden data after setCommits()', async () => {
    const client = new FakeGithubClient();
    const overridden = [
      {
        sha: 'abc123',
        message: 'overridden commit',
        author: 'someone',
        date: '2026-01-01T00:00:00Z',
        url: 'https://github.com/x/y/commit/abc123',
      },
    ];

    client.setCommits(overridden);

    expect(await client.getCommits()).toEqual(overridden);
  });

  it('returns a built-in canned fixture for getReleases() when nothing is overridden', async () => {
    const client = new FakeGithubClient();
    const releases = await client.getReleases();
    expect(releases.length).toBeGreaterThan(0);
  });

  it('returns the overridden data after setReleases()', async () => {
    const client = new FakeGithubClient();
    const overridden = [
      {
        tagName: 'v1.0.0',
        name: 'overridden release',
        body: null,
        publishedAt: '2026-01-01T00:00:00Z',
        url: 'https://github.com/x/y/releases/tag/v1.0.0',
      },
    ];

    client.setReleases(overridden);

    expect(await client.getReleases()).toEqual(overridden);
  });

  it('returns a built-in canned fixture for getFileTree() when nothing is overridden', async () => {
    const client = new FakeGithubClient();
    const tree = await client.getFileTree();
    expect(tree.length).toBeGreaterThan(0);
  });

  it('returns the overridden data after setFileTree()', async () => {
    const client = new FakeGithubClient();
    const overridden = [{ path: 'x.ts', type: 'blob' as const, sha: 'sha1' }];

    client.setFileTree(overridden);

    expect(await client.getFileTree()).toEqual(overridden);
  });

  it('returns a built-in canned fixture for getFileContent() when nothing is overridden', async () => {
    const client = new FakeGithubClient();
    const content = await client.getFileContent();
    expect(content.content.length).toBeGreaterThan(0);
    expect(content.encoding).toBe('utf-8');
  });

  it('returns the overridden data after setFileContent()', async () => {
    const client = new FakeGithubClient();
    const overridden = {
      content: 'overridden content',
      encoding: 'base64' as const,
    };

    client.setFileContent(overridden);

    expect(await client.getFileContent()).toEqual(overridden);
  });
});
