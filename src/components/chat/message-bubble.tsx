import { cn } from "@/lib/utils";
import type { ChatMessage } from "@/lib/types";

const ANCHOR = (href: string, label: string) =>
  `<a href="${href}" target="_blank" rel="noopener noreferrer" class="underline underline-offset-2 break-all">${label}</a>`;

/** Minimal, safe formatter: escapes HTML, then linkifies URLs and **bold**. */
function renderContent(text: string) {
  const escaped = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  // 1) Markdown links [label](url) -> anchor. Done first so the bare-URL pass
  //    below doesn't also match the URL inside the parentheses.
  const withMdLinks = escaped.replace(
    /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g,
    (_, label, href) => ANCHOR(href, label)
  );

  // 2) Bare URLs not already inside an href. Strip trailing punctuation
  //    (e.g. a sentence-ending "." or a stray ")") so links aren't broken.
  const withLinks = withMdLinks.replace(
    /(?<!href=")(https?:\/\/[^\s<]+)/g,
    (url) => {
      const clean = url.replace(/[.,;:!)\]]+$/, "");
      const tail = url.slice(clean.length);
      return ANCHOR(clean, clean) + tail;
    }
  );

  const withBold = withLinks.replace(
    /\*\*([^*]+)\*\*/g,
    "<strong>$1</strong>"
  );
  return withBold.replace(/\n/g, "<br/>");
}

export function MessageBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === "user";
  return (
    <div
      className={cn(
        "flex w-full animate-fade-in-up",
        isUser ? "justify-end" : "justify-start"
      )}
    >
      <div
        className={cn(
          "max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed shadow-sm",
          isUser
            ? "rounded-br-sm bg-primary text-primary-foreground"
            : "rounded-bl-sm bg-muted text-foreground"
        )}
      >
        {message.content ? (
          <div
            className="[&_a]:font-medium whitespace-pre-wrap break-words"
            // Content is escaped in renderContent before limited formatting.
            dangerouslySetInnerHTML={{ __html: renderContent(message.content) }}
          />
        ) : null}
      </div>
    </div>
  );
}
