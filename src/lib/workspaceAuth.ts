import { GoogleAuthProvider, signInWithPopup, User } from 'firebase/auth';
import { auth } from './firebase';

export const WORKSPACE_SCOPES = [
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/tasks'
];

let cachedAccessToken: string | null = null;
let cachedAccessTokenUserId: string | null = null;
let isSigningIn = false;

/**
 * Initiates client-side Google authentication with Workspace scopes.
 * Caches the access token in memory.
 */
export const googleWorkspaceSignIn = async (): Promise<{ user: User; accessToken: string } | null> => {
  if (isSigningIn) return null;
  try {
    isSigningIn = true;
    const provider = new GoogleAuthProvider();
    // Add required scopes
    WORKSPACE_SCOPES.forEach(scope => provider.addScope(scope));
    
    // Explicitly prompt for consent to ensure the user receives fresh tokens and scopes
    provider.setCustomParameters({
      prompt: 'consent'
    });

    const result = await signInWithPopup(auth, provider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    if (!credential?.accessToken) {
      throw new Error('No access token returned from Google Sign-In.');
    }

    cachedAccessToken = credential.accessToken;
    cachedAccessTokenUserId = result.user.uid;
    return { user: result.user, accessToken: cachedAccessToken };
  } catch (err: any) {
    const isUserCancellation = err?.code === 'auth/popup-closed-by-user' || 
                               err?.message?.includes('popup-closed-by-user') ||
                               err?.code === 'auth/cancelled-popup-request' ||
                               err?.message?.includes('cancelled-popup-request');
    if (isUserCancellation) {
      console.warn('Google Workspace Auth Cancelled by User:', err.message || err);
    } else {
      console.error('Google Workspace Auth Error:', err);
    }
    throw err;
  } finally {
    isSigningIn = false;
  }
};

/**
 * Gets the current cached Google Workspace access token.
 */
export const getCachedAccessToken = (): string | null => {
  // Never return a token unless it belongs to the currently authenticated Firebase user.
  if (!auth.currentUser || cachedAccessTokenUserId !== auth.currentUser.uid) {
    return null;
  }
  return cachedAccessToken;
};

/**
 * Sets the cached Google Workspace access token.
 */
export const setCachedAccessToken = (token: string | null, userId?: string) => {
  cachedAccessToken = token;
  cachedAccessTokenUserId = token ? (userId ?? auth.currentUser?.uid ?? null) : null;
};

/**
 * Clears the cached access token (called on sign out).
 */
export const clearCachedAccessToken = () => {
  cachedAccessToken = null;
  cachedAccessTokenUserId = null;
};

/**
 * Create a Google Calendar Event.
 */
export const createCalendarEvent = async (
  accessToken: string,
  event: { summary: string; description: string; startDateTime: string; endDateTime: string }
) => {
  const payload = {
    summary: event.summary,
    description: event.description,
    start: {
      dateTime: event.startDateTime,
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
    },
    end: {
      dateTime: event.endDateTime,
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
    }
  };

  const res = await fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });

  if (!res.ok) {
    const errorDetails = await res.json().catch(() => ({}));
    throw new Error(errorDetails.error?.message || 'Failed to create Google Calendar event');
  }

  return await res.json();
};

/**
 * Create a Google Task under the default list.
 */
export const createGoogleTask = async (
  accessToken: string,
  task: { title: string; notes: string; dueDateTime?: string }
) => {
  const payload: any = {
    title: task.title,
    notes: task.notes
  };

  if (task.dueDateTime) {
    // RFC3339 format, but for Google Tasks it only resolves date part correctly, so convert to ISO string.
    payload.due = new Date(task.dueDateTime).toISOString();
  }

  const res = await fetch('https://tasks.googleapis.com/tasks/v1/lists/@default/tasks', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });

  if (!res.ok) {
    const errorDetails = await res.json().catch(() => ({}));
    throw new Error(errorDetails.error?.message || 'Failed to create Google Task');
  }

  return await res.json();
};
