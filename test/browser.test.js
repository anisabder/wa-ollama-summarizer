import { test } from 'node:test';
import assert from 'node:assert/strict';
import { findBrowser, browserCandidates } from '../src/browser.js';

test('a configured path always wins', () => {
  assert.equal(findBrowser({ configured: '/opt/mybrowser', exists: () => false }), '/opt/mybrowser');
});
test('linux: first installed candidate is used', () => {
  const exists = (p) => p === '/usr/bin/google-chrome-stable';
  assert.equal(findBrowser({ platform: 'linux', exists }), '/usr/bin/google-chrome-stable');
});
test('windows: Chrome paths come before Edge and use env folders', () => {
  const env = { PROGRAMFILES: 'C:\\Program Files', 'PROGRAMFILES(X86)': 'C:\\Program Files (x86)', LOCALAPPDATA: 'C:\\Users\\a\\AppData\\Local' };
  const list = browserCandidates('win32', env);
  assert.ok(list[0].endsWith('Google\\Chrome\\Application\\chrome.exe'));
  assert.ok(list.findIndex((p) => p.includes('msedge')) > list.findIndex((p) => p.includes('chrome.exe')));
  const edgeOnly = (p) => p === 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
  assert.equal(findBrowser({ platform: 'win32', env, exists: edgeOnly }), 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe');
});
test('nothing found returns undefined', () => {
  assert.equal(findBrowser({ platform: 'linux', exists: () => false }), undefined);
});
