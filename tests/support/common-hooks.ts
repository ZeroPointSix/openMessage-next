import { After, Before, type ITestCaseHookParameter, setDefaultTimeout } from '@cucumber/cucumber';
import type { ICustomWorld } from './custom-world.ts';
import { buildApp } from './server.ts';

setDefaultTimeout(process.env.PWDEBUG ? -1 : 60 * 1000);

Before({ tags: '@pending' }, () => 'skipped' as unknown as undefined);

Before({ tags: '@debug' }, function (this: ICustomWorld) {
  this.debug = true;
});

Before(async function (this: ICustomWorld, { pickle }: ITestCaseHookParameter) {
  this.startTime = new Date();
  this.testName = pickle.name.replaceAll(/\W/g, '-');
  this.feature = pickle;
  this.context = {};
  this.cleanups = [];
  this.server = await buildApp();
});

After(async function (this: ICustomWorld, { result }: ITestCaseHookParameter) {
  try {
    if (result) {
      this.attach(`Status: ${result.status}. Duration:${result.duration.seconds}s`);
    }
    for (const cleanup of this.cleanups.toReversed()) {
      await cleanup();
    }
  } finally {
    try {
      await this.server.close();
    } finally {
      const { closeDbConnection } = await import('../../src/shared/db/postgres.ts');
      await closeDbConnection();
    }
  }
});
