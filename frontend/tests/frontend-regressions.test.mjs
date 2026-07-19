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
