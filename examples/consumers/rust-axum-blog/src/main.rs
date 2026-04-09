//! Axum web app reading @webhouse/cms JSON content.
//!
//! Single static binary, sub-millisecond reads, async tower stack.

mod webhouse;

use askama::Template;
use askama_axum::IntoResponse;
use axum::{
    extract::{Path, State},
    http::StatusCode,
    response::Response,
    routing::get,
    Router,
};
use std::env;
use std::sync::Arc;
use tower_http::services::ServeDir;

use webhouse::{Document, Reader, WebhouseError};

#[derive(Clone)]
struct AppState {
    cms: Arc<Reader>,
    globals: Document,
}

// ─── Templates ────────────────────────────────────────────────

#[derive(Template)]
#[template(path = "home.html")]
struct HomeTemplate {
    globals: Document,
    locale: String,
    posts: Vec<Document>,
}

#[derive(Template)]
#[template(path = "post.html")]
struct PostTemplate {
    globals: Document,
    post: Document,
    translation: Option<Document>,
    content_html: String,
}

#[derive(Template)]
#[template(path = "error.html")]
struct ErrorTemplate {
    globals: Document,
    status_code: u16,
    status_text: String,
}

// ─── Handlers ─────────────────────────────────────────────────

async fn home_en(State(state): State<AppState>) -> Response {
    let posts = state.cms.collection("posts", Some("en")).unwrap_or_default();
    HomeTemplate { globals: state.globals.clone(), locale: "en".into(), posts }.into_response()
}

async fn home_da(State(state): State<AppState>) -> Response {
    let posts = state.cms.collection("posts", Some("da")).unwrap_or_default();
    HomeTemplate { globals: state.globals.clone(), locale: "da".into(), posts }.into_response()
}

async fn post_handler(State(state): State<AppState>, Path(slug): Path<String>) -> Response {
    match state.cms.document("posts", &slug) {
        Err(WebhouseError::InvalidName(_)) => {
            (StatusCode::BAD_REQUEST, ErrorTemplate {
                globals: state.globals.clone(),
                status_code: 400,
                status_text: "Invalid slug".into(),
            }).into_response()
        }
        Err(_) => {
            (StatusCode::INTERNAL_SERVER_ERROR, ErrorTemplate {
                globals: state.globals.clone(),
                status_code: 500,
                status_text: "Server error".into(),
            }).into_response()
        }
        Ok(None) => {
            (StatusCode::NOT_FOUND, ErrorTemplate {
                globals: state.globals.clone(),
                status_code: 404,
                status_text: "Post not found".into(),
            }).into_response()
        }
        Ok(Some(post)) => {
            let translation = state.cms.find_translation(&post, "posts").ok().flatten();
            let content_html = render_markdown(&post.string("content"));
            PostTemplate { globals: state.globals.clone(), post, translation, content_html }.into_response()
        }
    }
}

fn render_markdown(md: &str) -> String {
    use pulldown_cmark::{Options, Parser, html};
    let mut opts = Options::empty();
    opts.insert(Options::ENABLE_TABLES);
    opts.insert(Options::ENABLE_STRIKETHROUGH);
    let parser = Parser::new_ext(md, opts);
    let mut out = String::new();
    html::push_html(&mut out, parser);
    out
}

// ─── Main ─────────────────────────────────────────────────────

#[tokio::main]
async fn main() {
    let port: u16 = env::var("PORT").ok()
        .and_then(|s| s.parse().ok())
        .unwrap_or(8080);

    let cms = Arc::new(Reader::new("content"));
    let globals = cms.globals();
    let state = AppState { cms, globals };

    let app = Router::new()
        .route("/", get(home_en))
        .route("/da/", get(home_da))
        .route("/blog/:slug", get(post_handler))
        .nest_service("/uploads", ServeDir::new("public/uploads"))
        .with_state(state);

    let listener = tokio::net::TcpListener::bind(format!("0.0.0.0:{}", port)).await.unwrap();
    println!("rust-axum-blog listening on :{}", port);
    axum::serve(listener, app).await.unwrap();
}
