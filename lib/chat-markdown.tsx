import type { ReactNode } from "react";

/**
 * Collapse unsupported stacked emphasis (**_x_**, _**x**_, ***) into single-style bold.
 * The chat renderer only supports **bold** and _italic_ — never combined.
 */
export function normalizeChatMarkdown(raw: string): string {
  return raw
    .replace(/\*\*\*([^*]+)\*\*\*/g, "**$1**")
    .replace(/\*\*_([^*_]+)_\*\*/g, "**$1**")
    .replace(/_\*\*([^*_]+)\*\*_/g, "**$1**")
    .replace(/_\*([^*]+)\*_/g, "*$1*");
}

function renderInline(text: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  let index = 0;
  let key = 0;

  while (index < text.length) {
    if (text.startsWith("**", index)) {
      const end = text.indexOf("**", index + 2);
      if (end !== -1) {
        nodes.push(
          <strong key={key++} className="font-semibold text-white">
            {text.slice(index + 2, end)}
          </strong>,
        );
        index = end + 2;
        continue;
      }
    }

    if (text[index] === "_") {
      const end = text.indexOf("_", index + 1);
      if (end !== -1) {
        nodes.push(
          <em key={key++} className="italic">
            {text.slice(index + 1, end)}
          </em>,
        );
        index = end + 1;
        continue;
      }
    }

    const nextSpecial = text.slice(index).search(/(\*\*|_)/);
    const chunkEnd = nextSpecial === -1 ? text.length : index + nextSpecial;
    if (chunkEnd > index) {
      nodes.push(text.slice(index, chunkEnd));
    }
    index = chunkEnd === index ? index + 1 : chunkEnd;
  }

  return nodes;
}

export function ChatMarkdown({ content }: { content: string }) {
  return <>{renderInline(normalizeChatMarkdown(content))}</>;
}
