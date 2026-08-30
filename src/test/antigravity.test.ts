import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const { isMissingProcessError } = require('../../electron/antigravity.cjs');

describe('Antigravity process detection', () => {
  it('treats taskkill exit code 128 as an already stopped process', () => {
    expect(isMissingProcessError({ code: 128, stderr: Buffer.from([0xff, 0xfe]) })).toBe(true);
  });

  it('keeps real taskkill failures actionable', () => {
    expect(isMissingProcessError({ code: 5, stderr: 'Access is denied' })).toBe(false);
  });
});
