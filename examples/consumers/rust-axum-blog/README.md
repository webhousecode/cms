# rust-axum-blog — @webhouse/cms consumer example

Axum + Tokio + Askama reading @webhouse/cms JSON content. Single static binary, sub-millisecond reads, memory-safe by default.

**Stack:** Rust 1.75+ · Axum 0.7 · Tokio · Askama templates · pulldown-cmark

## Quick start

```bash
cd examples/consumers/rust-axum-blog
cargo run
```

Open http://localhost:8080 (EN) or http://localhost:8080/da/ (DA).

### Release build (single static binary)

```bash
cargo build --release
./target/release/webhouse-axum-blog
```

The binary is ~5 MB with zero runtime dependencies.

## How it works

```
content/                    ← @webhouse/cms JSON files
src/webhouse.rs             ← reader (~180 LOC, serde + serde_json)
src/main.rs                 ← Axum routes + handlers
templates/                  ← Askama compile-time templates
  _layout.html
  home.html
  post.html
  error.html
Cargo.toml
```

```rust
let cms = Reader::new("content");

let posts = cms.collection("posts", Some("en"))?;
let post = cms.document("posts", "hello-world")?;
let translation = cms.find_translation(&post, "posts")?;
```

## Security

`Reader::validate()` rejects collection names and slugs that don't match `^[a-z0-9][a-z0-9-]*$`. Resolved paths via `canonicalize()` are checked against the content directory prefix.

## Production deployment

- **Fly.io / Railway:** Multi-stage Dockerfile (FROM rust:1.75 → FROM debian:slim)
- **Bare-metal:** `cargo build --release`, scp the binary, run
- **AWS Lambda:** `cargo lambda` for serverless

## Related

- **F125** — Framework-Agnostic Content Platform
