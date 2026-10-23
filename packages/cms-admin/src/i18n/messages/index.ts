/**
 * F211.2 — the catalog, one file per area so areas can be translated in
 * parallel without touching each other. Each file is a top-level namespace:
 * messages/<locale>/editor.json holds every "editor.*" key.
 * A new area = one file per locale + one line below.
 */
import type { Dict } from "@broberg/i18n";
import en_account from "./en/account.json";
import en_common from "./en/common.json";
import en_shell from "./en/shell.json";
import en_auth from "./en/auth.json";
import en_dashboard from "./en/dashboard.json";
import en_editor from "./en/editor.json";
import en_media from "./en/media.json";
import en_settings from "./en/settings.json";
import en_pages from "./en/pages.json";
import en_agents from "./en/agents.json";
import en_chat from "./en/chat.json";
import en_schema from "./en/schema.json";
import en_misc from "./en/misc.json";
import en_integrations from "./en/integrations.json";
import en_tools from "./en/tools.json";
import en_help from "./en/help.json";
import en_system from "./en/system.json";
import en_deployText from "./en/deployText.json";
import en_libText from "./en/libText.json";
import en_errApi from "./en/errApi.json";
import en_errCms from "./en/errCms.json";
import en_errAdmin from "./en/errAdmin.json";
import da_account from "./da/account.json";
import da_common from "./da/common.json";
import da_shell from "./da/shell.json";
import da_auth from "./da/auth.json";
import da_dashboard from "./da/dashboard.json";
import da_editor from "./da/editor.json";
import da_media from "./da/media.json";
import da_settings from "./da/settings.json";
import da_pages from "./da/pages.json";
import da_agents from "./da/agents.json";
import da_chat from "./da/chat.json";
import da_schema from "./da/schema.json";
import da_misc from "./da/misc.json";
import da_integrations from "./da/integrations.json";
import da_tools from "./da/tools.json";
import da_help from "./da/help.json";
import da_system from "./da/system.json";
import da_deployText from "./da/deployText.json";
import da_libText from "./da/libText.json";
import da_errApi from "./da/errApi.json";
import da_errCms from "./da/errCms.json";
import da_errAdmin from "./da/errAdmin.json";

export const en: Dict = {
  account: en_account,
  common: en_common,
  shell: en_shell,
  auth: en_auth,
  dashboard: en_dashboard,
  editor: en_editor,
  media: en_media,
  settings: en_settings,
  pages: en_pages,
  agents: en_agents,
  chat: en_chat,
  schema: en_schema,
  misc: en_misc,
  integrations: en_integrations,
  tools: en_tools,
  help: en_help,
  system: en_system,
  deployText: en_deployText,
  libText: en_libText,
  errApi: en_errApi,
  errCms: en_errCms,
  errAdmin: en_errAdmin,
};
export const da: Dict = {
  account: da_account,
  common: da_common,
  shell: da_shell,
  auth: da_auth,
  dashboard: da_dashboard,
  editor: da_editor,
  media: da_media,
  settings: da_settings,
  pages: da_pages,
  agents: da_agents,
  chat: da_chat,
  schema: da_schema,
  misc: da_misc,
  integrations: da_integrations,
  tools: da_tools,
  help: da_help,
  system: da_system,
  deployText: da_deployText,
  libText: da_libText,
  errApi: da_errApi,
  errCms: da_errCms,
  errAdmin: da_errAdmin,
};
