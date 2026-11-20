export function TypingIndicator() {
  return (
    <div className="flex items-center gap-1 px-1 py-2" aria-label="Assistant is typing">
      {[0, 0.16, 0.32].map((delay, i) => (
        <span
          key={i}
          className="h-2 w-2 rounded-full bg-primary/60 animate-bounce-dot"
          style={{ animationDelay: `${delay}s` }}
        />
      ))}
    </div>
  );
}
