import { GitHubApiService } from './githubApi';

export function createGitHubApiService(legacyToken?: string): GitHubApiService {
  void legacyToken;
  return new GitHubApiService();
}
