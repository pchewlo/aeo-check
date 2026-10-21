#!/usr/bin/env node
import { main } from '../src/cli.js';

main(process.argv.slice(2)).then((code) => { process.exitCode = code; }, (e) => {
  process.stderr.write(`aeo-check: ${e.stack || e.message}\n`);
  process.exitCode = 2;
});
