import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { loadConfig, savePhone } from '../src/vr/store';
import { PHONES, PHONE_IPHONE_13_PRO } from '../src/vr/screens';

describe('VR settings store', () => {
  it('defaults to the iPhone 13 Pro screen, and keeps a chosen phone', async () => {
    expect((await loadConfig()).phone?.id).toBe(PHONE_IPHONE_13_PRO.id);
    const other = PHONES.find((p) => p.id !== PHONE_IPHONE_13_PRO.id)!;
    await savePhone(other);
    expect((await loadConfig()).phone?.id).toBe(other.id);
  });
});
