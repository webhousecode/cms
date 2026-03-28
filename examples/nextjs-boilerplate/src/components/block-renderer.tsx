import type { Block } from "@/lib/content";

interface BlockRendererProps {
  blocks: Block[];
}

export function BlockRenderer({ blocks }: BlockRendererProps) {
  return (
    <>
      {blocks.map((block, i) => {
        switch (block._block) {
          case "hero":
            return <HeroBlock key={i} block={block} />;
          case "features":
            return <FeaturesBlock key={i} block={block} />;
          case "cta":
            return <CtaBlock key={i} block={block} />;
          default:
            return null;
        }
      })}
    </>
  );
}

function HeroBlock({ block }: { block: Block }) {
  const tagline = block.tagline as string;
  const description = block.description as string | undefined;
  const ctas = (block.ctas as { label: string; href: string }[]) ?? [];

  return (
    <section className="bg-secondary py-20">
      <div className="mx-auto max-w-3xl px-4 text-center">
        <h1 className="text-4xl font-extrabold tracking-tight text-foreground sm:text-5xl">
          {tagline}
        </h1>
        {description && (
          <p className="mt-4 text-lg text-muted">{description}</p>
        )}
        {ctas.length > 0 && (
          <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
            {ctas.map((cta, j) => (
              <a
                key={j}
                href={cta.href}
                className={
                  j === 0
                    ? "rounded-lg bg-primary px-6 py-3 text-sm font-medium text-primary-foreground hover:opacity-90 transition-opacity"
                    : "rounded-lg border border-border px-6 py-3 text-sm font-medium text-foreground hover:bg-secondary transition-colors"
                }
              >
                {cta.label}
              </a>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

function FeaturesBlock({ block }: { block: Block }) {
  const title = block.title as string | undefined;
  const items =
    (block.items as {
      icon?: string;
      title: string;
      description?: string;
    }[]) ?? [];

  return (
    <section className="py-16">
      <div className="mx-auto max-w-5xl px-4">
        {title && (
          <h2 className="mb-10 text-center text-2xl font-bold text-foreground">
            {title}
          </h2>
        )}
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {items.map((item, j) => (
            <div
              key={j}
              className="rounded-lg border border-border bg-card p-6"
            >
              {item.icon && (
                <span className="mb-3 block text-2xl">{item.icon}</span>
              )}
              <h3 className="mb-2 text-base font-semibold text-card-foreground">
                {item.title}
              </h3>
              {item.description && (
                <p className="text-sm text-muted">{item.description}</p>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function CtaBlock({ block }: { block: Block }) {
  const title = block.title as string;
  const description = block.description as string | undefined;
  const buttonText = block.buttonText as string | undefined;
  const buttonUrl = block.buttonUrl as string | undefined;

  return (
    <section className="bg-primary py-16">
      <div className="mx-auto max-w-3xl px-4 text-center">
        <h2 className="text-2xl font-bold text-primary-foreground">{title}</h2>
        {description && (
          <p className="mt-3 text-primary-foreground/80">{description}</p>
        )}
        {buttonText && buttonUrl && (
          <a
            href={buttonUrl}
            className="mt-6 inline-block rounded-lg bg-white px-6 py-3 text-sm font-medium text-primary hover:opacity-90 transition-opacity"
          >
            {buttonText}
          </a>
        )}
      </div>
    </section>
  );
}
