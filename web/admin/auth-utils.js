// Pure helpers for the forthcoming admin rebuild. This module does not contact Supabase.
export function usernameEmail(username) {
  return `${String(username || '').trim().toLowerCase()}@bazaarshop.app`;
}

export function signInError(error) {
  const message = String(error?.message || 'Unknown sign-in error');
  const code = String(error?.code || '').toLowerCase();
  const text = message.toLowerCase();
  if (code === 'invalid_credentials' || text.includes('invalid login credentials')) return 'Wrong username or password';
  if (code === 'email_not_confirmed' || text.includes('email not confirmed')) return 'This account is not confirmed. Ask the owner.';
  if (error?.status === 429 || code.includes('rate_limit') || text.includes('rate limit') || text.includes('too many requests')) return 'Too many tries. Wait and try again.';
  if (error?.name === 'AuthRetryableFetchError' || text.includes('failed to fetch') || text.includes('networkerror') || text.includes('network request failed')) return 'Cannot reach the server. Check the internet.';
  return message;
}

// UI-only deterrent: server-side rate limits remain essential.
export function createLockout(now = () => Date.now()) {
  let failures = 0;
  let until = 0;
  return {
    remaining: () => Math.max(0, Math.ceil((until - now()) / 1000)),
    fail() {
      if (now() < until) return;
      if (++failures >= 5) { until = now() + 30000; failures = 0; }
    },
    reset() { failures = 0; until = 0; },
  };
}
