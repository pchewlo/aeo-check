// Minimal glob matching: **, *, ?, {a,b}. Paths are posix and relative.
const cache = new Map();

export function globToRegex(glob) {
  if (cache.has(glob)) return cache.get(glob);
  let g = glob.replace(/^\.\//, '');
  const anchored = g.includes('/') && !g.startsWith('**/');
  let re = '';
  for (let i = 0; i < g.length; i++) {
    const c = g[i];
    if (c === '*') {
      if (g[i + 1] === '*') {
        i++;
        if (g[i + 1] === '/') { i++; re += '(?:.*/)?'; } else re += '.*';
      } else re += '[^/]*';
    } else if (c === '?') re += '[^/]';
    else if (c === '{') {
      const end = g.indexOf('}', i);
      const opts = g.slice(i + 1, end).split(',').map((o) => o.replace(/[.+^$()|[\]\\]/g, '\\$&'));
      re += `(?:${opts.join('|')})`;
      i = end;
    } else re += c.replace(/[.+^$()|[\]\\]/g, '\\$&');
  }
  // a pattern without a slash matches at any depth; a directory pattern matches everything inside it
  const full = anchored ? `^${re}(?:/.*)?$` : `(?:^|/)${re}(?:/.*)?$`;
  const rx = new RegExp(full);
  cache.set(glob, rx);
  return rx;
}

export function matchAny(path, globs) {
  return (globs || []).some((g) => globToRegex(g).test(path));
}
