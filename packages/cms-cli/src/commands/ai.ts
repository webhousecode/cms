import { loadConfig } from '../utils/config-loader.js';
import { logger } from '../utils/logger.js';

export async function aiGenerateCommand(args: {
  collection: string;
  prompt: string;
  status?: string;
  cwd?: string;
}) {
  const cwd = args.cwd ?? process.cwd();
  const config = await loadConfig(cwd);

  const col = config.collections.find(c => c.name === args.collection);
  if (!col) {
    logger.error(`Collection "${args.collection}" not found in cms.config.ts`);
    process.exit(1);
  }

  logger.info(`Generating content for "${args.collection}" with AI...`);

  const { createAi } = await import('@webhouse/cms-ai');
  const { createCms } = await import('@webhouse/cms');

  const ai = await createAi();
  const cms = await createCms(config);

  const result = await ai.content.generate(args.prompt, { collection: col });

  logger.info(`Creating document...`);
  const doc = await cms.content.create(args.collection, {
    slug: result.slug,
    status: (args.status ?? 'draft') as 'draft' | 'published',
    data: result.fields,
  }, { actor: 'ai', aiModel: 'claude-sonnet-4-6' });

  logger.success(`Created: ${doc.slug}`);
  logger.log(`  Status: ${doc.status}`);
  logger.log(`  Cost:   $${result.usage.estimatedCostUsd.toFixed(4)}`);
  logger.log(`  Tokens: ${result.usage.inputTokens} in / ${result.usage.outputTokens} out`);

  await cms.storage.close();
}

export async function aiRewriteCommand(args: {
  collection: string;
  slug: string;
  instruction: string;
  cwd?: string;
}) {
  const cwd = args.cwd ?? process.cwd();
  const config = await loadConfig(cwd);

  const col = config.collections.find(c => c.name === args.collection);
  if (!col) {
    logger.error(`Collection "${args.collection}" not found`);
    process.exit(1);
  }

  const { createAi } = await import('@webhouse/cms-ai');
  const { createCms } = await import('@webhouse/cms');

  const cms = await createCms(config);
  const doc = await cms.content.findBySlug(args.collection, args.slug);
  if (!doc) {
    logger.error(`Document "${args.slug}" not found in "${args.collection}"`);
    process.exit(1);
  }

  logger.info(`Rewriting "${args.slug}"...`);
  const ai = await createAi();
  const result = await ai.content.rewrite(doc.data, {
    instruction: args.instruction,
    collection: col,
  });

  const aiContext = { actor: 'ai' as const, aiModel: 'claude-sonnet-4-6' };
  const { document: updated, skippedFields } = await cms.content.updateWithContext(
    args.collection,
    doc.id,
    { data: result.fields },
    aiContext,
  );

  logger.success(`Updated: ${updated.slug}`);
  logger.log(`  Cost: $${result.usage.estimatedCostUsd.toFixed(4)}`);

  if (skippedFields.length > 0) {
    logger.warn(`  Skipped (locked by user): ${skippedFields.join(', ')}`);
  }

  await cms.storage.close();
}

export async function aiSeoCommand(args: { cwd?: string; status?: string }) {
  const cwd = args.cwd ?? process.cwd();
  const config = await loadConfig(cwd);
  const baseUrl = config.build?.baseUrl ?? 'https://example.com';
  const siteTitle =
    (config.build as Record<string, unknown> | undefined)?.['siteTitle'] as string ?? 'My Site';

  const { createAi } = await import('@webhouse/cms-ai');
  const { createCms } = await import('@webhouse/cms');

  const cms = await createCms(config);
  const ai = await createAi();
  const aiContext = { actor: 'ai' as const, aiModel: 'claude-sonnet-4-6' };

  let totalCost = 0;
  let totalDocs = 0;
  let totalSkipped = 0;

  for (const col of config.collections) {
    const { documents } = await cms.content.findMany(col.name, {
      status: (args.status ?? 'published') as 'published' | 'draft',
    });

    for (const doc of documents) {
      logger.info(`SEO: ${col.name}/${doc.slug}`);
      try {
        const seoResult = await ai.seo.optimize(doc, siteTitle, baseUrl);
        const { document: updated, skippedFields } = await cms.content.updateWithContext(
          col.name,
          doc.id,
          {
            data: {
              ...doc.data,
              _seo: {
                metaTitle: seoResult.metaTitle,
                metaDescription: seoResult.metaDescription,
                jsonLd: seoResult.jsonLd,
              },
            },
          },
          aiContext,
        );
        totalCost += seoResult.usage.estimatedCostUsd;
        totalDocs++;

        if (skippedFields.length > 0) {
          logger.warn(`  Skipped (locked): ${skippedFields.join(', ')}`);
          totalSkipped += skippedFields.length;
        }
        void updated;
      } catch (e) {
        logger.warn(`  Failed: ${String(e)}`);
      }
    }
  }

  logger.success(`SEO optimization complete`);
  logger.log(`  Documents: ${totalDocs}`);
  logger.log(`  Total cost: $${totalCost.toFixed(4)}`);
  if (totalSkipped > 0) {
    logger.log(`  Fields skipped (locked): ${totalSkipped}`);
  }

  await cms.storage.close();
}
