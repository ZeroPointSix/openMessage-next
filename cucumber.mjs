import { mkdirSync } from 'node:fs';

// https://github.com/cucumber/cucumber-js/blob/main/docs/configuration.md

// Tell @fastify/autoload to load .ts sources directly (cross-platform — avoids
// inline env vars in npm scripts, which cmd.exe cannot parse on Windows).
process.env.FASTIFY_AUTOLOAD_TYPESCRIPT ??= '1';
mkdirSync('reports', { recursive: true });

const config = {
  import: ['tests/support/**/*.ts', 'tests/**/*.steps.ts'],
  paths: ['tests/**/*.feature'],
  // Only one formatter may target stdout (the last wins); keep `pretty` there and
  // send the machine-readable reports to files.
  format: ['json:reports/cucumber-report.json', 'html:reports/index.html', 'pretty'],
  formatOptions: { snippetInterface: 'async-await' },
};

export default config;
