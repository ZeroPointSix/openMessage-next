import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';

const repoRoot = process.cwd();
const suffix = String(process.pid);
const alphaName = `__boundary_alpha_${suffix}`;
const betaName = `__boundary_beta_${suffix}`;
const interfaceName = `__boundary_interface_${suffix}`;
const alphaDir = path.join(repoRoot, 'src/modules', alphaName);
const betaDir = path.join(repoRoot, 'src/modules', betaName);
const interfaceDir = path.join(repoRoot, 'src/interfaces', interfaceName);

function write(relativePath: string, fileContent: string) {
  writeFileSync(path.join(repoRoot, relativePath), fileContent);
}

function cruise() {
  const result = spawnSync(
    'pnpm',
    ['exec', 'depcruise', 'src', '--config', '.dependency-cruiser.cjs', '--output-type', 'json'],
    {
      cwd: repoRoot,
      encoding: 'utf8',
    },
  );

  assert.equal(result.signal, null, result.stderr);
  assert.ok(result.stdout, result.stderr);

  const report = JSON.parse(result.stdout) as {
    summary: {
      error: number;
      violations: Array<{ rule: { name: string } }>;
    };
  };

  return {
    status: report.summary.error > 0 ? 1 : 0,
    ruleNames: report.summary.violations.map(({ rule }) => rule.name),
  };
}

describe('dependency boundaries', () => {
  it('rejects forbidden directions and allows another module public index', () => {
    mkdirSync(alphaDir, { recursive: true });
    mkdirSync(betaDir, { recursive: true });
    mkdirSync(interfaceDir, { recursive: true });

    try {
      write(
        `src/modules/${alphaName}/delivery-sdk.ts`,
        "import fastify from 'fastify';\nexport const forbiddenSdk = fastify;\n",
      );
      write(`src/modules/${betaName}/internal.ts`, 'export const internal = true;\n');
      write(`src/modules/${betaName}/index.ts`, 'export const publicValue = true;\n');
      write(
        `src/modules/${alphaName}/module-internal.ts`,
        `export { internal } from '../${betaName}/internal.ts';\n`,
      );
      write(
        `src/modules/${alphaName}/module-public.ts`,
        `export { publicValue } from '../${betaName}/index.ts';\n`,
      );
      write(
        `src/interfaces/${interfaceName}/persistence.ts`,
        "export { getDb } from '../../shared/db/postgres.ts';\n",
      );

      const forbidden = cruise();
      assert.equal(forbidden.status, 1);
      assert.ok(forbidden.ruleNames.includes('no-modules-to-delivery-sdks'));
      assert.ok(forbidden.ruleNames.includes('no-interfaces-to-persistence'));
      assert.ok(forbidden.ruleNames.includes('module-to-module-public-api-only'));

      rmSync(path.join(alphaDir, 'delivery-sdk.ts'));
      rmSync(path.join(alphaDir, 'module-internal.ts'));
      rmSync(interfaceDir, { recursive: true, force: true });

      const allowed = cruise();
      assert.equal(allowed.status, 0);
      assert.ok(!allowed.ruleNames.includes('module-to-module-public-api-only'));
    } finally {
      rmSync(alphaDir, { recursive: true, force: true });
      rmSync(betaDir, { recursive: true, force: true });
      rmSync(interfaceDir, { recursive: true, force: true });
    }
  });
});
