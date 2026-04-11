/**
 * Permission system tests.
 *
 * Tests the core permission resolution logic — wildcards, role mappings,
 * and the hasPermission / resolvePermissions functions. No network or
 * file I/O needed.
 */

import { describe, expect, it } from "vitest";
import { hasPermission, resolvePermissions, ROLE_PERMISSIONS } from "../permissions-shared";

describe("hasPermission", () => {
  it("exact match", () => {
    expect(hasPermission(["content.create"], "content.create")).toBe(true);
  });

  it("no match", () => {
    expect(hasPermission(["content.create"], "deploy.trigger")).toBe(false);
  });

  it("global wildcard matches everything", () => {
    expect(hasPermission(["*"], "deploy.trigger")).toBe(true);
    expect(hasPermission(["*"], "users.manage")).toBe(true);
  });

  it("namespace wildcard matches children", () => {
    expect(hasPermission(["content.*"], "content.create")).toBe(true);
    expect(hasPermission(["content.*"], "content.publish")).toBe(true);
    expect(hasPermission(["content.*"], "content.trash.empty")).toBe(true);
  });

  it("namespace wildcard does NOT match other namespaces", () => {
    expect(hasPermission(["content.*"], "deploy.trigger")).toBe(false);
    expect(hasPermission(["content.*"], "media.upload")).toBe(false);
  });

  it("partial wildcard at deeper level", () => {
    expect(hasPermission(["content.trash.*"], "content.trash.empty")).toBe(true);
    expect(hasPermission(["content.trash.*"], "content.create")).toBe(false);
  });

  it("empty granted list denies everything", () => {
    expect(hasPermission([], "content.read")).toBe(false);
  });
});

describe("resolvePermissions", () => {
  it("admin gets all permissions", () => {
    const perms = resolvePermissions("admin");
    expect(perms).toContain("content.create");
    expect(perms).toContain("deploy.trigger");
    expect(perms).toContain("users.manage");
    expect(perms).toContain("settings.edit");
    expect(perms.length).toBeGreaterThan(15);
  });

  it("editor gets content + media + deploy + curation but NOT settings/users/backup", () => {
    const perms = resolvePermissions("editor");
    expect(perms).toContain("content.create");
    expect(perms).toContain("content.publish");
    expect(perms).toContain("media.upload");
    expect(perms).toContain("deploy.trigger");
    expect(perms).toContain("curation.review");
    expect(perms).toContain("chat.use");
    expect(perms).toContain("agents.run");
    expect(perms).toContain("forms.read");

    expect(perms).not.toContain("settings.edit");
    expect(perms).not.toContain("users.manage");
    expect(perms).not.toContain("backup.manage");
    expect(perms).not.toContain("beam.transfer");
    expect(perms).not.toContain("tokens.manage");
    expect(perms).not.toContain("agents.manage");
    expect(perms).not.toContain("forms.manage");
    expect(perms).not.toContain("import.execute");
    expect(perms).not.toContain("content.trash.empty");
  });

  it("viewer gets read-only permissions", () => {
    const perms = resolvePermissions("viewer");
    expect(perms).toContain("content.read");
    expect(perms).toContain("media.read");
    expect(perms).toContain("forms.read");

    expect(perms).not.toContain("content.create");
    expect(perms).not.toContain("media.upload");
    expect(perms).not.toContain("deploy.trigger");
    expect(perms).not.toContain("settings.edit");
  });
});

describe("ROLE_PERMISSIONS consistency", () => {
  it("all three roles are defined", () => {
    expect(ROLE_PERMISSIONS.admin).toBeDefined();
    expect(ROLE_PERMISSIONS.editor).toBeDefined();
    expect(ROLE_PERMISSIONS.viewer).toBeDefined();
  });

  it("editor is a subset of admin", () => {
    const adminPerms = resolvePermissions("admin");
    const editorPerms = resolvePermissions("editor");
    for (const p of editorPerms) {
      expect(adminPerms).toContain(p);
    }
  });

  it("viewer is a subset of editor", () => {
    const editorPerms = resolvePermissions("editor");
    const viewerPerms = resolvePermissions("viewer");
    for (const p of viewerPerms) {
      expect(editorPerms).toContain(p);
    }
  });
});
