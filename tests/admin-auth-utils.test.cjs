// Mocked, not real: these tests do not contact Supabase or exercise the UI.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
async function helpers() {
  const source = fs.readFileSync(path.join(__dirname, '../web/admin/auth-utils.js'));
  return import(`data:text/javascript;base64,${source.toString('base64')}`);
}
test('mocked, not real: username and error messages', async () => {
  const { usernameEmail, signInError } = await helpers();
  assert.equal(usernameEmail('  Abdulmanan  '), 'abdulmanan@bazaarshop.app');
  assert.equal(signInError({ message: 'Invalid login credentials' }), 'Wrong username or password');
  assert.equal(signInError({ message: 'Email not confirmed' }), 'This account is not confirmed. Ask the owner.');
  assert.equal(signInError({ name: 'AuthRetryableFetchError', message: 'Failed to fetch' }), 'Cannot reach the server. Check the internet.');
  assert.equal(signInError({ status: 429, message: 'Too many requests' }), 'Too many tries. Wait and try again.');
  assert.equal(signInError({ message: 'Database unavailable' }), 'Database unavailable');
});
test('mocked, not real: five failures lock for thirty seconds', async () => {
  const { createLockout } = await helpers();
  let now = 1000;
  const lock = createLockout(() => now);
  for (let i = 0; i < 5; i++) lock.fail();
  assert.equal(lock.remaining(), 30);
  now += 1000;
  assert.equal(lock.remaining(), 29);
  now += 29000;
  assert.equal(lock.remaining(), 0);
});
