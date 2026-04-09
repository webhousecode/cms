/** Topic keys — mirrors push-store.ts server-side. Keep in sync. */
export type TopicKey =
  | "build_failed"
  | "build_succeeded"
  | "agent_completed"
  | "curation_pending"
  | "link_check_failed"
  | "scheduled_publish";
