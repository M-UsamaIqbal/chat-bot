import { ChatWidget } from "@/components/chat/chat-widget";
import { resolveOrg } from "@/lib/org";

export const dynamic = "force-dynamic";

/**
 * Standalone widget page designed to be embedded in an <iframe> on external
 * sites via the loader at /embed/widget.js. Renders the chat panel full-bleed.
 */
export default async function WidgetPage({
  searchParams,
}: {
  searchParams: Promise<{ org?: string }>;
}) {
  const { org: orgSlug } = await searchParams;
  const { org, config } = await resolveOrg(orgSlug);

  return (
    <main className="h-screen w-screen bg-transparent">
      <ChatWidget
        embedded
        orgSlug={org.slug}
        botName={config.bot_name}
        welcomeMessage={config.welcome_message}
        suggestedQuestions={config.suggested_questions}
        primaryColor={config.primary_color}
        bookingUrl={config.booking_url}
      />
    </main>
  );
}
