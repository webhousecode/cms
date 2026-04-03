/**
 * F119 — Fly.io Machines API Client.
 *
 * Pure HTTP client — no flyctl dependency. Connects to the
 * Machines API at https://api.machines.dev/v1/.
 *
 * Token is passed per-instance and NEVER logged or persisted.
 */

const MACHINES_API = "https://api.machines.dev/v1";

export interface FlyOrg {
  slug: string;
  name: string;
  type: string;
}

export interface FlyApp {
  id: string;
  name: string;
  organization: { slug: string };
  status: string;
}

export interface FlyMachine {
  id: string;
  name: string;
  state: string;
  region: string;
  instance_id: string;
}

export interface FlyIp {
  id: string;
  address: string;
  type: string;
  region: string;
}

export interface MachineServicePort {
  port: number;
  handlers: string[];
  force_https?: boolean;
}

export interface MachineService {
  ports: MachineServicePort[];
  protocol: string;
  internal_port: number;
}

export interface MachineConfig {
  image: string;
  env?: Record<string, string>;
  services?: MachineService[];
  guest?: {
    cpu_kind: string;
    cpus: number;
    memory_mb: number;
  };
}

export class FlyMachinesClient {
  private token: string;

  constructor(token: string) {
    this.token = token;
  }

  private headers(): Record<string, string> {
    return {
      Authorization: `Bearer ${this.token}`,
      "Content-Type": "application/json",
    };
  }

  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
  ): Promise<T> {
    const res = await fetch(`${MACHINES_API}${path}`, {
      method,
      headers: this.headers(),
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(
        `Fly API ${method} ${path} returned ${res.status}: ${text}`,
      );
    }

    // Some endpoints return empty body
    const text = await res.text();
    return text ? JSON.parse(text) : ({} as T);
  }

  /**
   * List organizations accessible with this token.
   * Used to verify token validity and auto-detect org.
   */
  async listOrgs(): Promise<FlyOrg[]> {
    // The orgs endpoint is on the GraphQL API, not Machines API
    // Use the apps list endpoint instead to verify token
    const res = await fetch("https://api.fly.io/graphql", {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify({
        query: `{ organizations { nodes { slug name type } } }`,
      }),
    });
    if (!res.ok) throw new Error(`Token verification failed: ${res.status}`);
    const data = await res.json();
    return data.data?.organizations?.nodes ?? [];
  }

  /**
   * Create a new Fly.io app.
   */
  async createApp(name: string, orgSlug: string): Promise<FlyApp> {
    return this.request<FlyApp>("POST", "/apps", {
      app_name: name,
      org_slug: orgSlug,
    });
  }

  /**
   * Check if an app exists.
   */
  async getApp(name: string): Promise<FlyApp | null> {
    try {
      return await this.request<FlyApp>("GET", `/apps/${name}`);
    } catch {
      return null;
    }
  }

  /**
   * Set secrets on an app.
   */
  async setSecrets(
    appName: string,
    secrets: Record<string, string>,
  ): Promise<void> {
    // Secrets are set via the GraphQL API
    const res = await fetch("https://api.fly.io/graphql", {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify({
        query: `mutation($input: SetSecretsInput!) { setSecrets(input: $input) { app { name } } }`,
        variables: {
          input: {
            appId: appName,
            secrets: Object.entries(secrets).map(([key, value]) => ({
              key,
              value,
            })),
          },
        },
      }),
    });
    if (!res.ok) throw new Error(`Failed to set secrets: ${res.status}`);
    const data = await res.json();
    if (data.errors?.length) {
      throw new Error(data.errors[0].message);
    }
  }

  /**
   * Create a machine (container instance).
   */
  async createMachine(
    appName: string,
    region: string,
    config: MachineConfig,
  ): Promise<FlyMachine> {
    return this.request<FlyMachine>(
      "POST",
      `/apps/${appName}/machines`,
      {
        region,
        config,
      },
    );
  }

  /**
   * Wait for a machine to reach "started" state.
   */
  async waitForMachine(
    appName: string,
    machineId: string,
    timeoutSeconds = 60,
  ): Promise<void> {
    const res = await fetch(
      `${MACHINES_API}/apps/${appName}/machines/${machineId}/wait?state=started&timeout=${timeoutSeconds}`,
      { headers: this.headers() },
    );
    if (!res.ok) {
      throw new Error(`Machine did not start within ${timeoutSeconds}s`);
    }
  }

  /**
   * Allocate a shared IPv4 address.
   */
  async allocateSharedIpv4(appName: string): Promise<string> {
    const res = await fetch("https://api.fly.io/graphql", {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify({
        query: `mutation($input: AllocateIPAddressInput!) { allocateIpAddress(input: $input) { ipAddress { address type } } }`,
        variables: {
          input: { appId: appName, type: "shared_v4" },
        },
      }),
    });
    if (!res.ok) throw new Error(`Failed to allocate IPv4: ${res.status}`);
    const data = await res.json();
    if (data.errors?.length) throw new Error(data.errors[0].message);
    return data.data.allocateIpAddress.ipAddress.address;
  }

  /**
   * Allocate a dedicated IPv6 address.
   */
  async allocateIpv6(appName: string): Promise<string> {
    const res = await fetch("https://api.fly.io/graphql", {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify({
        query: `mutation($input: AllocateIPAddressInput!) { allocateIpAddress(input: $input) { ipAddress { address type } } }`,
        variables: {
          input: { appId: appName, type: "v6" },
        },
      }),
    });
    if (!res.ok) throw new Error(`Failed to allocate IPv6: ${res.status}`);
    const data = await res.json();
    if (data.errors?.length) throw new Error(data.errors[0].message);
    return data.data.allocateIpAddress.ipAddress.address;
  }
}

/**
 * Fly.io region presets. Default: arn (Stockholm).
 */
export const FLY_REGIONS = [
  { value: "arn", label: "Stockholm, SE (arn)" },
  { value: "fra", label: "Frankfurt, DE (fra)" },
  { value: "lhr", label: "London, UK (lhr)" },
  { value: "ams", label: "Amsterdam, NL (ams)" },
  { value: "cdg", label: "Paris, FR (cdg)" },
  { value: "iad", label: "Virginia, US (iad)" },
  { value: "sjc", label: "San Jose, US (sjc)" },
  { value: "nrt", label: "Tokyo, JP (nrt)" },
  { value: "syd", label: "Sydney, AU (syd)" },
  { value: "sin", label: "Singapore (sin)" },
] as const;

/**
 * VM size presets for the wizard.
 */
export const FLY_VM_SIZES = [
  { value: "shared-cpu-1x-256", label: "Shared 1x — 256 MB", cpuKind: "shared", cpus: 1, memoryMb: 256 },
  { value: "shared-cpu-1x-512", label: "Shared 1x — 512 MB", cpuKind: "shared", cpus: 1, memoryMb: 512 },
  { value: "shared-cpu-2x-1024", label: "Shared 2x — 1 GB", cpuKind: "shared", cpus: 2, memoryMb: 1024 },
  { value: "performance-1x-2048", label: "Performance 1x — 2 GB", cpuKind: "performance", cpus: 1, memoryMb: 2048 },
] as const;
