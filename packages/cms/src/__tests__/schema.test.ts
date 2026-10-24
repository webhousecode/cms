import { describe, it, expect } from 'vitest';
import { validateConfig, safeValidateConfig } from '../schema/validate.js';
import { defineConfig, defineCollection } from '../schema/define.js';

describe('schema validation', () => {
  it('validates a valid config', () => {
    const config = defineConfig({
      collections: [
        defineCollection({
          name: 'posts',
          fields: [
            { name: 'title', type: 'text', required: true },
          ],
        }),
      ],
    });
    const validated = validateConfig(config);
    expect(validated.collections).toHaveLength(1);
    expect(validated.collections[0]?.name).toBe('posts');
  });

  it('rejects config with no collections', () => {
    const result = safeValidateConfig({ collections: [] });
    expect(result.success).toBe(false);
  });

  it('rejects config with invalid field type', () => {
    const result = safeValidateConfig({
      collections: [{ name: 'test', fields: [{ name: 'f', type: 'invalid' }] }],
    });
    expect(result.success).toBe(false);
  });

  it('names the invalid field type in the issue (cms-admin shows it to the editor)', () => {
    // zod 4 leaves the input out of an issue unless asked; site-pool's
    // formatSiteError reads code "invalid_value" + input to say WHICH type.
    try {
      validateConfig({ collections: [{ name: 'p', fields: [{ name: 't', type: 'txet' }] }] });
      expect.unreachable();
    } catch (e) {
      const issue = (e as { issues: Array<{ code: string; path: PropertyKey[]; input?: unknown }> }).issues[0]!;
      expect(issue.code).toBe('invalid_value');
      expect(issue.path.join('.')).toBe('collections.0.fields.0.type');
      expect(issue.input).toBe('txet');
    }
  });
});
