# Code Audit Report

**Generated:** 2026-03-16 15:41
**Tool:** knip v5.87.0

---

## Results

```
Unused files (17)
docs/redesign/cms.jsx                                   
docs/redesign/main.jsx                                  
docs/redesign/vite.config.js                            
examples/blog/cms.config.ts                             
examples/landing/cms.config.ts                          
packages/cms-admin/src/components/agents-list-toggle.tsx
packages/cms-admin/src/components/ui/select.tsx         
packages/cms-admin/src/components/user-org-bar.tsx      
packages/cms-admin/src/lib/upload-dir.ts                
packages/cms/src/content/types.ts                       
packages/cms/src/storage/sqlite/schema.ts               
packages/cms/src/template/builtins/hero.ts              
packages/cms/src/template/builtins/image.ts             
packages/cms/src/template/builtins/richtext.ts          
scripts/screenshots.ts                                  
scripts/seed-supabase.ts                                
scripts/test-supabase.ts                                
Unused dependencies (9)
@webhouse/cms          examples/blog/package.json:11:6     
@webhouse/cms-cli      examples/blog/package.json:12:6     
@webhouse/cms          examples/landing/package.json:15:6  
@webhouse/cms-cli      examples/landing/package.json:16:6  
@supabase/supabase-js  package.json:30:6                   
@types/bcryptjs        packages/cms-admin/package.json:27:6
@webhouse/cms-ai       packages/cms-admin/package.json:29:6
prosemirror-view       packages/cms-admin/package.json:41:6
@hono/node-server      packages/cms/package.json:62:6      
Unused devDependencies (4)
@types/better-sqlite3  package.json:19:6
jose                   package.json:21:6
playwright             package.json:23:6
tsup                   package.json:24:6
Unlisted dependencies (1)
postcss  packages/cms-admin/postcss.config.mjs
Unused exports (36)
AvatarGroup                         packages/cms-admin/src/components/ui/avatar.tsx:106:3       
AvatarGroupCount                    packages/cms-admin/src/components/ui/avatar.tsx:107:3       
AvatarBadge                         packages/cms-admin/src/components/ui/avatar.tsx:108:3       
badgeVariants                       packages/cms-admin/src/components/ui/badge.tsx:52:17        
buttonVariants                      packages/cms-admin/src/components/ui/button.tsx:58:18       
DropdownMenuPortal                  packages/cms-admin/src/components/ui/dropdown-menu.tsx:265:3
DropdownMenuCheckboxItem            packages/cms-admin/src/components/ui/dropdown-menu.tsx:271:3
DropdownMenuRadioGroup              packages/cms-admin/src/components/ui/dropdown-menu.tsx:272:3
DropdownMenuRadioItem               packages/cms-admin/src/components/ui/dropdown-menu.tsx:273:3
DropdownMenuShortcut                packages/cms-admin/src/components/ui/dropdown-menu.tsx:275:3
DropdownMenuSub                     packages/cms-admin/src/components/ui/dropdown-menu.tsx:276:3
DropdownMenuSubTrigger              packages/cms-admin/src/components/ui/dropdown-menu.tsx:277:3
DropdownMenuSubContent              packages/cms-admin/src/components/ui/dropdown-menu.tsx:278:3
SheetTrigger                        packages/cms-admin/src/components/ui/sheet.tsx:128:3        
SheetClose                          packages/cms-admin/src/components/ui/sheet.tsx:129:3        
SheetFooter                         packages/cms-admin/src/components/ui/sheet.tsx:132:3        
SidebarGroupAction                  packages/cms-admin/src/components/ui/sidebar.tsx:704:3      
SidebarInput                        packages/cms-admin/src/components/ui/sidebar.tsx:708:3      
SidebarMenuAction                   packages/cms-admin/src/components/ui/sidebar.tsx:711:3      
SidebarMenuBadge                    packages/cms-admin/src/components/ui/sidebar.tsx:712:3      
SidebarMenuSkeleton                 packages/cms-admin/src/components/ui/sidebar.tsx:715:3      
SidebarMenuSub                      packages/cms-admin/src/components/ui/sidebar.tsx:716:3      
SidebarMenuSubButton                packages/cms-admin/src/components/ui/sidebar.tsx:717:3      
SidebarMenuSubItem                  packages/cms-admin/src/components/ui/sidebar.tsx:718:3      
SidebarRail                         packages/cms-admin/src/components/ui/sidebar.tsx:720:3      
SidebarSeparator                    packages/cms-admin/src/components/ui/sidebar.tsx:721:3      
useSidebar                          packages/cms-admin/src/components/ui/sidebar.tsx:723:3      
getPrompt                 function  packages/cms-admin/src/lib/ai-prompts.ts:87:23              
DEFAULT_COCKPIT                     packages/cms-admin/src/lib/cockpit.ts:17:14                 
saveMcpServers            function  packages/cms-admin/src/lib/mcp-servers.ts:32:23             
getSingleSitePathsSync    function  packages/cms-admin/src/lib/site-paths.ts:140:17             
invalidate                function  packages/cms-admin/src/lib/site-pool.ts:151:17              
invalidateAll             function  packages/cms-admin/src/lib/site-pool.ts:155:17              
findOrg                   function  packages/cms-admin/src/lib/site-registry.ts:93:17           
getAdminMode              function  packages/cms-admin/src/lib/site-registry.ts:188:23          
WYSIWYG_SCRIPT                      packages/cms-admin/src/lib/wysiwyg-inject.ts:12:14          
Unused exported types (36)
SelectOption          interface  packages/cms-admin/src/components/ui/custom-select.tsx:6:18
AgentRunResult        interface  packages/cms-admin/src/lib/agent-runner.ts:18:18           
AiConfigMasked        interface  packages/cms-admin/src/lib/ai-config.ts:17:18              
AIPromptDef           interface  packages/cms-admin/src/lib/ai-prompts.ts:5:18              
RunEntry              interface  packages/cms-admin/src/lib/analytics.ts:13:18              
ContentEdit           interface  packages/cms-admin/src/lib/analytics.ts:28:18              
AgentStats            interface  packages/cms-admin/src/lib/analytics.ts:39:18              
CostSummary           interface  packages/cms-admin/src/lib/analytics.ts:50:18              
ContentRatio          interface  packages/cms-admin/src/lib/analytics.ts:58:18              
User                  interface  packages/cms-admin/src/lib/auth.ts:7:18                    
SessionPayload        interface  packages/cms-admin/src/lib/auth.ts:16:18                   
CockpitParams         interface  packages/cms-admin/src/lib/cockpit.ts:5:18                 
GitHubMediaFile       interface  packages/cms-admin/src/lib/github-media.ts:13:18           
McpConfig             interface  packages/cms-admin/src/lib/mcp-config.ts:11:18             
McpApiKeyMasked       interface  packages/cms-admin/src/lib/mcp-config.ts:15:18             
McpConfigMasked       interface  packages/cms-admin/src/lib/mcp-config.ts:22:18             
MediaAdapter          type       packages/cms-admin/src/lib/media/index.ts:10:15            
MediaFileInfo         type       packages/cms-admin/src/lib/media/index.ts:10:34            
MediaType             type       packages/cms-admin/src/lib/media/index.ts:10:54            
MediaMeta             type       packages/cms-admin/src/lib/media/index.ts:10:70            
InteractiveMeta       type       packages/cms-admin/src/lib/media/index.ts:10:86            
RevalidationPayload   interface  packages/cms-admin/src/lib/revalidation.ts:15:18           
RevalidationResult    interface  packages/cms-admin/src/lib/revalidation.ts:22:18           
Revision              interface  packages/cms-admin/src/lib/revisions.ts:14:18              
SitePaths             interface  packages/cms-admin/src/lib/site-paths.ts:27:18             
CmsInstance           interface  packages/cms-admin/src/lib/site-pool.ts:102:18             
AdminMode             type       packages/cms-admin/src/lib/site-registry.ts:186:13         
Tab                   type       packages/cms-admin/src/lib/tabs-context.tsx:10:13          
ToolRegistry          interface  packages/cms-admin/src/lib/tools/index.ts:14:18            
GitSyncOptions        interface  packages/cms-cli/src/utils/git-sync.ts:12:18               
RateLimitResult       type       packages/cms-mcp-client/src/rate-limit.ts:23:13            
AuthResult            type       packages/cms-mcp-server/src/auth.ts:9:13                   
OutputOptions         interface  packages/cms/src/build/output.ts:5:18                      
JsonSchemaProperty    interface  packages/cms/src/schema/introspect.ts:3:18                 
CollectionJsonSchema  interface  packages/cms/src/schema/introspect.ts:15:18                
SafeHtml              interface  packages/cms/src/template/engine.ts:1:18                   
```

---

## How to use this report

1. **Unused files** — safe to delete if no dynamic imports reference them
2. **Unused exports** — remove the `export` keyword or delete the function
3. **Unused dependencies** — `pnpm remove <pkg>` from the relevant package
4. **Unlisted dependencies** — add them to package.json or remove the import
5. **Unused types** — remove if not part of the public API

Run `npx knip --fix` to auto-remove unused exports (review changes before committing).
Run `npx knip --fix --allow-remove-files` to also delete unused files.

