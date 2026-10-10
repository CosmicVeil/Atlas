import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const frontendRoot = new URL('..', import.meta.url);

test('portfolio stock detail no longer references the removed calculateStats helper', async () => {
  const source = await readFile(new URL('src/pages/Portfolio.jsx', frontendRoot), 'utf8');

  assert.doesNotMatch(source, /calculateStats\(selectedPortfolio\)/);
});

test('budget error UI imports the alert components it renders', async () => {
  const source = await readFile(new URL('src/pages/AIAnalysisScreen.jsx', frontendRoot), 'utf8');

  assert.match(
    source,
    /import\s+\{\s*Alert\s*,\s*AlertDescription\s*\}\s+from\s+["']\.\.\/components\/ui\/alert["'];/
  );
  assert.match(source, /AlertCircle/);
});

test('portfolio creation cannot lose the new item to a concurrent list response', async () => {
  const source = await readFile(new URL('src/pages/Portfolio.jsx', frontendRoot), 'utf8');
  const createHandler = source.match(
    /async function handleCreatePortfolio\(e\) \{(?<body>[\s\S]*?)\n  \}/
  );

  assert.ok(createHandler, 'expected the portfolio creation submit handler');
  assert.match(
    createHandler.groups.body,
    /setPortfolios\(\s*(?:current|previous|portfolios)\s*=>\s*\[\.\.\.(?:current|previous|portfolios),\s*created\]\s*\)/,
    'creation must use a functional state update instead of a render-time portfolios snapshot'
  );
});

test('portfolio list responses are ordered so stale requests cannot overwrite newer state', async () => {
  const source = await readFile(new URL('src/pages/Portfolio.jsx', frontendRoot), 'utf8');
  const fetchHandler = source.match(
    /async function fetchPortfolios\([^)]*\) \{(?<body>[\s\S]*?)\n  \}/
  );

  assert.ok(fetchHandler, 'expected the portfolio list request function');
  assert.match(fetchHandler.groups.body, /\+\+portfoliosRequestRef\.current/);
  assert.match(
    fetchHandler.groups.body,
    /requestId\s*!==\s*portfoliosRequestRef\.current\)\s*return[\s\S]*?setPortfolios\(data\)/,
    'the stale-response guard must run before a list response updates state'
  );
  assert.doesNotMatch(
    fetchHandler.groups.body,
    /else\s*\{\s*setPortfolios\(\[\]\)/,
    'an error response must not clear a list that already contains a newly created portfolio'
  );
});

test('portfolio creation refreshes the authoritative list after saving', async () => {
  const source = await readFile(new URL('src/pages/Portfolio.jsx', frontendRoot), 'utf8');
  const createHandler = source.match(
    /async function handleCreatePortfolio\(e\) \{(?<body>[\s\S]*?)\n  \}/
  );

  assert.ok(createHandler, 'expected the portfolio creation submit handler');
  assert.match(
    createHandler.groups.body,
    /setPortfolios\([\s\S]*?created[\s\S]*?fetchPortfolios\(\)/
  );
});

test('portfolio creation surfaces failures instead of failing silently', async () => {
  const source = await readFile(new URL('src/pages/Portfolio.jsx', frontendRoot), 'utf8');
  const createHandler = source.match(
    /async function handleCreatePortfolio\(e\) \{(?<body>[\s\S]*?)\n  \}/
  );

  assert.ok(createHandler, 'expected the portfolio creation submit handler');
  assert.match(createHandler.groups.body, /try\s*\{/);
  assert.match(createHandler.groups.body, /catch\s*\(/);
  assert.match(createHandler.groups.body, /alert\(created\.error\)/);
});

test('portfolio creation sends a trimmed name', async () => {
  const source = await readFile(new URL('src/pages/Portfolio.jsx', frontendRoot), 'utf8');
  const createHandler = source.match(
    /async function handleCreatePortfolio\(e\) \{(?<body>[\s\S]*?)\n  \}/
  );

  assert.ok(createHandler, 'expected the portfolio creation submit handler');
  assert.match(createHandler.groups.body, /newPortfolioName\.trim\(\)/);
  assert.match(createHandler.groups.body, /createPortfolio\(token,\s*name\)/);
});

test('portfolio list updates never use a render-time snapshot', async () => {
  const source = await readFile(new URL('src/pages/Portfolio.jsx', frontendRoot), 'utf8');

  assert.doesNotMatch(source, /setPortfolios\(\s*\[\.\.\.portfolios/);
  assert.doesNotMatch(source, /setPortfolios\(\s*portfolios\./);
});

test('portfolio edits and deletes refresh the authoritative list', async () => {
  const source = await readFile(new URL('src/pages/Portfolio.jsx', frontendRoot), 'utf8');

  for (const handlerName of ['handleUpdatePortfolio', 'handleDeletePortfolio']) {
    const handler = source.match(
      new RegExp(`async function ${handlerName}\\([^)]*\\) \\{(?<body>[\\s\\S]*?)\\n  \\}`)
    );

    assert.ok(handler, `expected ${handlerName}`);
    assert.match(
      handler.groups.body,
      /if\s*\(!result\.error\)\s*\{[\s\S]*?fetchPortfolios\(\)/,
      `${handlerName} must start a newer portfolio list request`
    );
  }
});

test('changing authentication clears the previous account portfolio state', async () => {
  const source = await readFile(new URL('src/pages/Portfolio.jsx', frontendRoot), 'utf8');
  const tokenEffect = source.match(
    /useEffect\(\(\) => \{(?<body>[\s\S]*?)\}, \[token\]\)/
  );

  assert.ok(tokenEffect, 'expected the token-dependent portfolio effect');
  assert.match(tokenEffect.groups.body, /fetchPortfolios\(true\)/);

  const fetchHandler = source.match(
    /async function fetchPortfolios\([^)]*\) \{(?<body>[\s\S]*?)\n  \}/
  );
  assert.ok(fetchHandler, 'expected the portfolio list request function');
  assert.match(fetchHandler.groups.body, /if\s*\(clearExisting\)/);
  assert.match(fetchHandler.groups.body, /setPortfolios\(\[\]\)/);
  assert.match(fetchHandler.groups.body, /setSelectedPortfolio\(null\)/);
});
