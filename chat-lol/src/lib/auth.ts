const TOKEN_STORAGE_KEY = 'chat-lol-token';
const USERNAME_STORAGE_KEY = 'chat-lol-username';

export interface AuthState {
  token: string | null;
  username: string | null;
  isAuthenticated: boolean;
}

export const authStorage = {
  saveAuth: (token: string, username: string) => {
    localStorage.setItem(TOKEN_STORAGE_KEY, token);
    localStorage.setItem(USERNAME_STORAGE_KEY, username);
  },

  getAuth: (): AuthState => {
    if (typeof window === 'undefined') {
      return { token: null, username: null, isAuthenticated: false };
    }
    
    const token = localStorage.getItem(TOKEN_STORAGE_KEY);
    const username = localStorage.getItem(USERNAME_STORAGE_KEY);
    
    return {
      token,
      username,
      isAuthenticated: !!(token && username)
    };
  },

  clearAuth: () => {
    localStorage.removeItem(TOKEN_STORAGE_KEY);
    localStorage.removeItem(USERNAME_STORAGE_KEY);
  }
};