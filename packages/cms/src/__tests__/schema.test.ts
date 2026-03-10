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
});
