export interface GithubIssue {
  number: number;
  title: string;
  state: 'open' | 'closed';
  body: string | null;
  user: string;
  createdAt: string;
  url: string;
}

export interface GithubCommit {
  sha: string;
  message: string;
  author: string;
  date: string;
  url: string;
}

export interface GithubRelease {
  tagName: string;
  name: string | null;
  body: string | null;
  publishedAt: string;
  url: string;
}

export interface GithubFileTreeEntry {
  path: string;
  type: 'blob' | 'tree';
  sha: string;
}
