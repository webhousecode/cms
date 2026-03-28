"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { Components } from "react-markdown";

interface ArticleBodyProps {
  content: string;
}

/**
 * Renders richtext (markdown) content with react-markdown.
 * Images support float and width via the title attribute:
 *   ![alt](src "float-left 50%")
 */
export function ArticleBody({ content }: ArticleBodyProps) {
  const components: Components = {
    img({ src, alt, title }) {
      const style: React.CSSProperties = {};

      if (title) {
        const parts = title.split(" ");
        for (const part of parts) {
          if (part === "float-left") {
            style.float = "left";
            style.marginRight = "1rem";
            style.marginBottom = "0.5rem";
          } else if (part === "float-right") {
            style.float = "right";
            style.marginLeft = "1rem";
            style.marginBottom = "0.5rem";
          } else if (part.endsWith("%") || part.endsWith("px")) {
            style.width = part;
          }
        }
      }

      return (
        <img
          src={src}
          alt={alt ?? ""}
          style={style}
          className="rounded-lg max-w-full h-auto"
          loading="lazy"
        />
      );
    },
    a({ href, children }) {
      const isExternal = href?.startsWith("http");
      return (
        <a
          href={href}
          {...(isExternal
            ? { target: "_blank", rel: "noopener noreferrer" }
            : {})}
        >
          {children}
        </a>
      );
    },
    table({ children }) {
      return (
        <div className="overflow-x-auto">
          <table>{children}</table>
        </div>
      );
    },
  };

  return (
    <div className="prose">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {content}
      </ReactMarkdown>
    </div>
  );
}
