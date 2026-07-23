import nock from 'nock';
import {
  GithubCommitResponse,
  GithubContentResponse,
  GithubIssueResponse,
  GithubReleaseResponse,
  GithubRepoResponse,
  GithubTreeResponse,
} from '../../shared/github-provider/real-github-client';

export const GITHUB_API_BASE_URL = 'https://api.github.com';

export function mockGithubIssues(
  repoPath: string,
  issues: GithubIssueResponse[],
): nock.Scope {
  return nock(GITHUB_API_BASE_URL)
    .get(`/repos/${repoPath}/issues`)
    .query(true)
    .reply(200, issues);
}

export function mockGithubCommits(
  repoPath: string,
  commits: GithubCommitResponse[],
): nock.Scope {
  return nock(GITHUB_API_BASE_URL)
    .get(`/repos/${repoPath}/commits`)
    .query(true)
    .reply(200, commits);
}

export function mockGithubReleases(
  repoPath: string,
  releases: GithubReleaseResponse[],
): nock.Scope {
  return nock(GITHUB_API_BASE_URL)
    .get(`/repos/${repoPath}/releases`)
    .query(true)
    .reply(200, releases);
}

export function mockGithubRepo(
  repoPath: string,
  repo: GithubRepoResponse,
): nock.Scope {
  return nock(GITHUB_API_BASE_URL).get(`/repos/${repoPath}`).reply(200, repo);
}

export function mockGithubTree(
  repoPath: string,
  defaultBranch: string,
  tree: GithubTreeResponse,
): nock.Scope {
  return nock(GITHUB_API_BASE_URL)
    .get(`/repos/${repoPath}/git/trees/${defaultBranch}`)
    .query(true)
    .reply(200, tree);
}

export function mockGithubContent(
  repoPath: string,
  path: string,
  content: GithubContentResponse,
): nock.Scope {
  const encodedPath = path
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/');
  return nock(GITHUB_API_BASE_URL)
    .get(`/repos/${repoPath}/contents/${encodedPath}`)
    .reply(200, content);
}

export function mockGithubContentNotFoundError(
  repoPath: string,
  path: string,
): nock.Scope {
  const encodedPath = path
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/');
  return nock(GITHUB_API_BASE_URL)
    .get(`/repos/${repoPath}/contents/${encodedPath}`)
    .reply(404, { message: 'Not Found' });
}

export function mockGithubRateLimitError(repoPath: string): nock.Scope {
  return nock(GITHUB_API_BASE_URL)
    .get(`/repos/${repoPath}/issues`)
    .query(true)
    .reply(403, { message: 'API rate limit exceeded' });
}

export function mockGithubNotFoundError(repoPath: string): nock.Scope {
  return nock(GITHUB_API_BASE_URL)
    .get(`/repos/${repoPath}`)
    .reply(404, { message: 'Not Found' });
}
