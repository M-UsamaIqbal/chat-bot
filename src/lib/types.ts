/** Shared domain types used across the app, widget, and admin dashboard. */

export type Role = "user" | "assistant" | "system";

export interface TrackerResult {
  key: string;
  name: string;
  found: boolean;
  ids: string[];
  category: "analytics" | "ads" | "other";
  /** True when the tag was found inside the Google Tag Manager container. */
  viaGtm?: boolean;
}

export interface AuditResult {
  ok: boolean;
  url: string;
  finalUrl: string;
  error?: string;
  trackers: TrackerResult[];
  foundCount: number;
  coreFound: number;
  coreTotal: number;
  viaGtm: boolean;
  checkedAt: string;
}

export interface ChatMessage {
  id: string;
  role: Role;
  content: string;
  createdAt?: string;
  /** Rich audit report attached to an assistant message (rendered as a card). */
  audit?: AuditResult;
}

export interface OrgChatbotConfig {
  id: string;
  organization_id: string;
  bot_name: string;
  welcome_message: string;
  suggested_questions: string[];
  primary_color: string;
  booking_url: string | null;
  human_handoff_enabled: boolean;
  lead_capture_enabled: boolean;
  vector_store_id: string | null;
}

export interface Organization {
  id: string;
  slug: string;
  name: string;
  created_at: string;
}

export interface Lead {
  id: string;
  organization_id: string;
  conversation_id: string | null;
  name: string;
  email: string;
  phone: string | null;
  service_interest: string | null;
  requirements: string | null;
  status: "new" | "contacted" | "qualified" | "closed";
  created_at: string;
}

export interface Conversation {
  id: string;
  organization_id: string;
  session_id: string;
  visitor_name: string | null;
  status: "active" | "handoff_requested" | "resolved";
  created_at: string;
  updated_at: string;
}

export interface HandoffRequest {
  id: string;
  organization_id: string;
  conversation_id: string;
  reason: string | null;
  status: "pending" | "resolved";
  created_at: string;
  resolved_at: string | null;
}

export interface KnowledgeDocument {
  id: string;
  organization_id: string;
  title: string;
  source_type: "file" | "faq" | "url" | "text";
  content: string | null;
  url: string | null;
  openai_file_id: string | null;
  status: "pending" | "indexed" | "failed";
  created_at: string;
}

/** The structured action the chat backend can signal to the client. */
export interface ChatAction {
  type: "lead_capture" | "human_handoff" | "booking" | "none";
  payload?: Record<string, unknown>;
}
