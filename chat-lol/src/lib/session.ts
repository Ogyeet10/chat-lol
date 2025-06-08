export interface SessionInfo {
  sessionId: string;
  createdAt: number;
}

const SESSION_KEY = 'chat-lol-session-id';

function saveSessionId(sessionId: string): void {
  const sessionInfo: SessionInfo = { sessionId, createdAt: Date.now() };
  try {
    if (typeof window !== 'undefined') {
      localStorage.setItem(SESSION_KEY, JSON.stringify(sessionInfo));
    }
  } catch (error) {
    console.error("Could not save session ID to localStorage", error);
  }
}

function getCurrentSessionId(): string | null {
  try {
    if (typeof window === 'undefined') return null;

    const item = localStorage.getItem(SESSION_KEY);
    if (!item) return null;
    
    const sessionInfo: SessionInfo = JSON.parse(item);
    
    // Optional: Check if session is too old (e.g., > 1 day)
    const oneDay = 24 * 60 * 60 * 1000;
    if (Date.now() - sessionInfo.createdAt > oneDay) {
      clearSessionId();
      return null;
    }

    return sessionInfo.sessionId;
  } catch (error) {
    console.error("Could not retrieve session ID from localStorage", error);
    return null;
  }
}

function clearSessionId(): void {
  try {
    if (typeof window !== 'undefined') {
      localStorage.removeItem(SESSION_KEY);
    }
  } catch (error) {
    console.error("Could not clear session ID from localStorage", error);
  }
}

export const sessionStorage = {
  saveSessionId,
  getCurrentSessionId,
  clearSessionId,
};