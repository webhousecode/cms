import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { GitHubStorageAdapter } from '../storage/github/adapter.js';

// ── helpers ──────────────────────────────────────────────────────────────────

function b64(content: string): string {
  return Buffer.from(content, 'utf-8').toString('base64');
}

function makeDoc(overrides: Record<string, unknown> = {}) {
  return {
    id: 'abc123',
    slug: 'hello-world',
    collection: 'posts',
    status: 'published',
    data: { title: 'Hello World', tags: ['cms'] },
    _fieldMeta: {},
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function makeFetchMock(responses: Array<{ status: number; body: unknown }>) {
  let call = 0;
  return vi.fn(async () => {
    const r = responses[call] ?? responses[responses.length - 1];
    call++;
    return {
      ok: r.status >= 200 && r.status < 300,
      status: r.status,
      statusText: String(r.status),
      json: async () => r.body,
    };
  });
}

function makeAdapter() {
  return new GitHubStorageAdapter({
    owner: 'acme',
    repo: 'site',
    branch: 'main',
    contentDir: 'content',
    token: 'ghp_test',
  });
}

// ── tests ─────────────────────────────────────────────────────────────────────

describe('GitHubStorageAdapter', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  // ── initialize ─────────────────────────────────────────────────────────────

  it('initialize: calls repo endpoint and succeeds', async () => {
    const fetchMock = makeFetchMock([{ status: 200, body: { full_name: 'acme/site' } }]);
    vi.stubGlobal('fetch', fetchMock);

    const adapter = makeAdapter();
    await expect(adapter.initialize()).resolves.toBeUndefined();
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock.mock.calls[0][0]).toContain('/repos/acme/site');
  });

  it('initialize: throws on 401', async () => {
    vi.stubGlobal('fetch', makeFetchMock([{ status: 401, body: {} }]));
    await expect(makeAdapter().initialize()).rejects.toThrow('bad token');
  });

  it('initialize: throws on 404', async () => {
    vi.stubGlobal('fetch', makeFetchMock([{ status: 404, body: {} }]));
    await expect(makeAdapter().initialize()).rejects.toThrow('not found');
  });

  // ── create ─────────────────────────────────────────────────────────────────

  it('create: encodes JSON to base64 and calls PUT', async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if ((init?.method ?? 'GET') === 'PUT') {
        const body = JSON.parse(init!.body as string) as Record<string, unknown>;
        // Verify content is valid base64-encoded JSON
        const decoded = Buffer.from(body['content'] as string, 'base64').toString('utf-8');
        const doc = JSON.parse(decoded) as Record<string, unknown>;
        expect(doc['collection']).toBe('posts');
        expect(doc['data']).toEqual({ title: 'My Post' });
        return {
          ok: true,
          status: 201,
          statusText: '201',
          json: async () => ({ content: { sha: 'newsha123' } }),
        };
      }
      return { ok: true, status: 200, statusText: '200', json: async () => ({}) };
    });
    vi.stubGlobal('fetch', fetchMock);

    const adapter = makeAdapter();
    const doc = await adapter.create('posts', { data: { title: 'My Post' }, status: 'published' });

    expect(doc.collection).toBe('posts');
    expect(doc.slug).toBe('my-post');
    expect(doc.status).toBe('published');
    expect(doc.data['title']).toBe('My Post');
    expect(doc.id).toBeTruthy();

    const putCall = fetchMock.mock.calls.find(c => c[1]?.method === 'PUT');
    expect(putCall).toBeDefined();
    const putUrl = putCall![0] as string;
    expect(putUrl).toContain('content/posts/my-post.json');
  });

  it('create: commit message includes collection and slug', async () => {
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      if (init?.method === 'PUT') {
        const body = JSON.parse(init.body as string) as Record<string, unknown>;
        expect(body['message']).toContain('posts');
        return { ok: true, status: 201, statusText: '201', json: async () => ({ content: { sha: 'sha1' } }) };
      }
      return { ok: true, status: 200, statusText: '200', json: async () => ({}) };
    });
    vi.stubGlobal('fetch', fetchMock);

    await makeAdapter().create('posts', { data: { title: 'Test' } });
  });

  // ── findBySlug ─────────────────────────────────────────────────────────────

  it('findBySlug: fetches correct path and decodes document', async () => {
    const doc = makeDoc();
    const fetchMock = makeFetchMock([
      { status: 200, body: { content: b64(JSON.stringify(doc)), sha: 'sha1' } },
    ]);
    vi.stubGlobal('fetch', fetchMock);

    const result = await makeAdapter().findBySlug('posts', 'hello-world');
    expect(result?.id).toBe('abc123');
    expect(result?.slug).toBe('hello-world');
    expect(result?.data['title']).toBe('Hello World');

    const url = fetchMock.mock.calls[0][0] as string;
    expect(url).toContain('content/posts/hello-world.json');
    expect(url).toContain('ref=main');
  });

  it('findBySlug: returns null for 404', async () => {
    vi.stubGlobal('fetch', makeFetchMock([{ status: 404, body: {} }]));
    const result = await makeAdapter().findBySlug('posts', 'does-not-exist');
    expect(result).toBeNull();
  });

  it('findBySlug: is scoped to collection — same slug in different collections returns different paths', async () => {
    const docPosts = makeDoc({ collection: 'posts' });
    const docPages = makeDoc({ collection: 'pages', id: 'xyz789' });

    let callCount = 0;
    const fetchMock = vi.fn(async (url: string) => {
      callCount++;
      if (url.includes('content/posts/hello-world.json')) {
        return { ok: true, status: 200, statusText: '200', json: async () => ({ content: b64(JSON.stringify(docPosts)), sha: 'sha-posts' }) };
      }
      if (url.includes('content/pages/hello-world.json')) {
        return { ok: true, status: 200, statusText: '200', json: async () => ({ content: b64(JSON.stringify(docPages)), sha: 'sha-pages' }) };
      }
      return { ok: false, status: 404, statusText: '404', json: async () => ({}) };
    });
    vi.stubGlobal('fetch', fetchMock);

    const adapter = makeAdapter();
    const fromPosts = await adapter.findBySlug('posts', 'hello-world');
    const fromPages = await adapter.findBySlug('pages', 'hello-world');

    expect(fromPosts?.id).toBe('abc123');
    expect(fromPages?.id).toBe('xyz789');
    expect(callCount).toBe(2);
  });

  // ── findMany ───────────────────────────────────────────────────────────────

  it('findMany: lists directory and fetches each file', async () => {
    const doc1 = makeDoc({ id: 'id1', slug: 'post-1', data: { title: 'Post 1' }, status: 'published' });
    const doc2 = makeDoc({ id: 'id2', slug: 'post-2', data: { title: 'Post 2' }, status: 'draft' });

    const fetchMock = vi.fn(async (url: string) => {
      if (url.includes('content/posts?') || url.endsWith('content/posts')) {
        return {
          ok: true, status: 200, statusText: '200',
          json: async () => [
            { name: 'post-1.json', type: 'file', sha: 'sha1' },
            { name: 'post-2.json', type: 'file', sha: 'sha2' },
          ],
        };
      }
      if (url.includes('post-1.json')) {
        return { ok: true, status: 200, statusText: '200', json: async () => ({ content: b64(JSON.stringify(doc1)), sha: 'sha1' }) };
      }
      if (url.includes('post-2.json')) {
        return { ok: true, status: 200, statusText: '200', json: async () => ({ content: b64(JSON.stringify(doc2)), sha: 'sha2' }) };
      }
      return { ok: false, status: 404, statusText: '404', json: async () => ({}) };
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await makeAdapter().findMany('posts');
    expect(result.total).toBe(2);
    expect(result.documents.map(d => d.slug)).toContain('post-1');
    expect(result.documents.map(d => d.slug)).toContain('post-2');
  });

  it('findMany: applies status filter', async () => {
    const doc1 = makeDoc({ id: 'id1', slug: 'post-1', status: 'published' });
    const doc2 = makeDoc({ id: 'id2', slug: 'post-2', status: 'draft' });

    const fetchMock = vi.fn(async (url: string) => {
      if (url.includes('content/posts?') || url.includes('/content/posts?')) {
        return {
          ok: true, status: 200, statusText: '200',
          json: async () => [
            { name: 'post-1.json', type: 'file', sha: 'sha1' },
            { name: 'post-2.json', type: 'file', sha: 'sha2' },
          ],
        };
      }
      if (url.includes('post-1.json')) {
        return { ok: true, status: 200, statusText: '200', json: async () => ({ content: b64(JSON.stringify(doc1)), sha: 'sha1' }) };
      }
      if (url.includes('post-2.json')) {
        return { ok: true, status: 200, statusText: '200', json: async () => ({ content: b64(JSON.stringify(doc2)), sha: 'sha2' }) };
      }
      return { ok: false, status: 404, statusText: '404', json: async () => ({}) };
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await makeAdapter().findMany('posts', { status: 'published' });
    expect(result.total).toBe(1);
    expect(result.documents[0].status).toBe('published');
  });

  it('findMany: tags filter (AND logic)', async () => {
    const docBoth = makeDoc({ id: 'id1', slug: 'both', data: { title: 'Both', tags: ['cms', 'ai'] }, status: 'published' });
    const docCmsOnly = makeDoc({ id: 'id2', slug: 'cms-only', data: { title: 'CMS Only', tags: ['cms'] }, status: 'published' });

    const fetchMock = vi.fn(async (url: string) => {
      if (url.includes('content/posts?')) {
        return {
          ok: true, status: 200, statusText: '200',
          json: async () => [
            { name: 'both.json', type: 'file', sha: 'sha1' },
            { name: 'cms-only.json', type: 'file', sha: 'sha2' },
          ],
        };
      }
      if (url.includes('both.json')) {
        return { ok: true, status: 200, statusText: '200', json: async () => ({ content: b64(JSON.stringify(docBoth)), sha: 'sha1' }) };
      }
      if (url.includes('cms-only.json')) {
        return { ok: true, status: 200, statusText: '200', json: async () => ({ content: b64(JSON.stringify(docCmsOnly)), sha: 'sha2' }) };
      }
      return { ok: false, status: 404, statusText: '404', json: async () => ({}) };
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await makeAdapter().findMany('posts', { tags: ['cms', 'ai'] });
    expect(result.total).toBe(1);
    expect(result.documents[0].slug).toBe('both');
  });

  it('findMany: orderBy data field (numeric)', async () => {
    const docA = makeDoc({ id: 'id1', slug: 'c', data: { title: 'C', sortOrder: 3 }, status: 'published' });
    const docB = makeDoc({ id: 'id2', slug: 'a', data: { title: 'A', sortOrder: 1 }, status: 'published' });
    const docC = makeDoc({ id: 'id3', slug: 'b', data: { title: 'B', sortOrder: 2 }, status: 'published' });

    const fetchMock = vi.fn(async (url: string) => {
      if (url.includes('content/posts?')) {
        return {
          ok: true, status: 200, statusText: '200',
          json: async () => [
            { name: 'c.json', type: 'file', sha: 'sha1' },
            { name: 'a.json', type: 'file', sha: 'sha2' },
            { name: 'b.json', type: 'file', sha: 'sha3' },
          ],
        };
      }
      if (url.includes('/c.json')) return { ok: true, status: 200, statusText: '200', json: async () => ({ content: b64(JSON.stringify(docA)), sha: 'sha1' }) };
      if (url.includes('/a.json')) return { ok: true, status: 200, statusText: '200', json: async () => ({ content: b64(JSON.stringify(docB)), sha: 'sha2' }) };
      if (url.includes('/b.json')) return { ok: true, status: 200, statusText: '200', json: async () => ({ content: b64(JSON.stringify(docC)), sha: 'sha3' }) };
      return { ok: false, status: 404, statusText: '404', json: async () => ({}) };
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await makeAdapter().findMany('posts', { orderBy: 'sortOrder', order: 'asc' });
    expect(result.documents.map(d => d.data['title'])).toEqual(['A', 'B', 'C']);
  });

  it('findMany: returns empty for non-existent collection (404 from dir list)', async () => {
    vi.stubGlobal('fetch', makeFetchMock([{ status: 404, body: {} }]));
    const result = await makeAdapter().findMany('nonexistent');
    expect(result.total).toBe(0);
    expect(result.documents).toHaveLength(0);
  });

  // ── update ─────────────────────────────────────────────────────────────────

  it('update: fetches SHA if not cached, then PUTs with SHA', async () => {
    const doc = makeDoc();
    let putBody: Record<string, unknown> | null = null;

    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      const method = init?.method ?? 'GET';

      // findById → listDir
      if (method === 'GET' && url.includes('content/posts?')) {
        return { ok: true, status: 200, statusText: '200', json: async () => [{ name: 'hello-world.json', type: 'file', sha: 'original-sha' }] };
      }
      // findById → fetchDocument (GET file)
      if (method === 'GET' && url.includes('hello-world.json')) {
        return { ok: true, status: 200, statusText: '200', json: async () => ({ content: b64(JSON.stringify(doc)), sha: 'original-sha' }) };
      }
      // PUT update
      if (method === 'PUT') {
        putBody = JSON.parse(init!.body as string) as Record<string, unknown>;
        return { ok: true, status: 200, statusText: '200', json: async () => ({ content: { sha: 'updated-sha' } }) };
      }
      return { ok: false, status: 404, statusText: '404', json: async () => ({}) };
    });
    vi.stubGlobal('fetch', fetchMock);

    const adapter = makeAdapter();
    const updated = await adapter.update('posts', 'abc123', { data: { title: 'Updated Title' } });

    expect(updated.data['title']).toBe('Updated Title');
    expect(putBody).not.toBeNull();
    // SHA was obtained during fetchDocument (cached), must be sent in PUT
    expect(putBody!['sha']).toBe('original-sha');
  });

  // ── delete ─────────────────────────────────────────────────────────────────

  it('delete: uses cached SHA (no extra GET after create)', async () => {
    const doc = makeDoc();
    const deleteCalls: string[] = [];

    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      const method = init?.method ?? 'GET';

      if (method === 'PUT') {
        return { ok: true, status: 201, statusText: '201', json: async () => ({ content: { sha: 'cached-sha' } }) };
      }
      if (method === 'DELETE') {
        const body = JSON.parse(init!.body as string) as Record<string, unknown>;
        deleteCalls.push(body['sha'] as string);
        return { ok: true, status: 200, statusText: '200', json: async () => ({}) };
      }
      // findById for delete → listDir
      if (url.includes('content/posts?')) {
        return { ok: true, status: 200, statusText: '200', json: async () => [{ name: 'hello-world.json', type: 'file', sha: 'cached-sha' }] };
      }
      // findById → fetchDocument
      if (url.includes('hello-world.json')) {
        return { ok: true, status: 200, statusText: '200', json: async () => ({ content: b64(JSON.stringify(doc)), sha: 'cached-sha' }) };
      }
      return { ok: false, status: 404, statusText: '404', json: async () => ({}) };
    });
    vi.stubGlobal('fetch', fetchMock);

    const adapter = makeAdapter();

    // Simulate a prior create that cached the SHA
    // by manually priming the cache via a findBySlug call
    await adapter.findBySlug('posts', 'hello-world'); // caches sha = 'cached-sha'

    await adapter.delete('posts', 'abc123');

    expect(deleteCalls).toHaveLength(1);
    expect(deleteCalls[0]).toBe('cached-sha');
  });

  it('delete: throws if document not found', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url.includes('content/posts?')) {
        return { ok: true, status: 200, statusText: '200', json: async () => [] };
      }
      return { ok: false, status: 404, statusText: '404', json: async () => ({}) };
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(makeAdapter().delete('posts', 'nonexistent')).rejects.toThrow('not found');
  });

  // ── migrate / close ────────────────────────────────────────────────────────

  it('migrate: is a no-op', async () => {
    vi.stubGlobal('fetch', vi.fn());
    await expect(makeAdapter().migrate(['posts', 'pages'])).resolves.toBeUndefined();
    expect(vi.mocked(fetch)).not.toHaveBeenCalled();
  });

  it('close: is a no-op', async () => {
    vi.stubGlobal('fetch', vi.fn());
    await expect(makeAdapter().close()).resolves.toBeUndefined();
    expect(vi.mocked(fetch)).not.toHaveBeenCalled();
  });
});
