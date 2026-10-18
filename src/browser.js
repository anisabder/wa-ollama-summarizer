import { existsSync } from 'node:fs';

export function browserCandidates(platform = process.platform, env = process.env) {
  if (platform === 'win32') {
    const roots = [env.PROGRAMFILES, env['PROGRAMFILES(X86)'], env.LOCALAPPDATA].filter(Boolean);
    return [
      ...roots.map((r) => `${r}\\Google\\Chrome\\Application\\chrome.exe`),
      ...roots.map((r) => `${r}\\Microsoft\\Edge\\Application\\msedge.exe`),
    ];
  }
  if (platform === 'darwin') {
    return [
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      '/Applications/Chromium.app/Contents/MacOS/Chromium',
      '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
    ];
  }
  return [
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/google-chrome',
    '/snap/bin/chromium',
  ];
}

export function findBrowser({ configured = '', platform, env, exists = existsSync } = {}) {
  if (configured) return configured;
  return browserCandidates(platform, env).find((p) => exists(p));
}
