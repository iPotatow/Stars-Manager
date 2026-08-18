import { fireEvent, render, screen, waitFor } from '../vue-testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LoginScreen } from './LoginScreen';

const { login } = vi.hoisted(() => ({
  login: vi.fn(),
}));

vi.mock('../services/backendAdapter', () => ({
  backend: {
    isSessionAuthenticated: false,
    hasGitHubToken: false,
    login,
    configureGitHubToken: vi.fn(),
  },
}));

vi.mock('../store/useAppStore', () => ({
  useAppStore: (selector?: (state: Record<string, unknown>) => unknown) => {
    const state = {
      language: 'zh',
      repositories: [],
      lastSync: null,
      setUser: vi.fn(),
      setGitHubToken: vi.fn(),
      setLanguage: vi.fn(),
    };
    return selector ? selector(state) : state;
  },
}));

describe('LoginScreen', () => {
  beforeEach(() => {
    login.mockReset();
    login.mockResolvedValue({ githubConfigured: false });
  });

  it('enables the workspace login button after both credentials are entered', async () => {
    render(<LoginScreen />);

    const username = screen.getByLabelText('Workspace username');
    const password = screen.getByLabelText('Workspace password');
    const button = screen.getByRole('button', { name: /登录工作区/ });

    expect(button).toBeDisabled();

    fireEvent.input(username, { target: { value: 'admin' } });
    fireEvent.input(password, { target: { value: 'secret' } });

    await waitFor(() => expect(button).toBeEnabled());
    fireEvent.click(button);

    await waitFor(() => expect(login).toHaveBeenCalledWith('admin', 'secret'));
  });
});
