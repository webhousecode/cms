//! F125 reference reader for @webhouse/cms file-based content (Rust).
//!
//! Reads JSON documents from content/{collection}/ via std::fs.
//! Designed to be thin (zero deps beyond serde/serde_json) and safe —
//! slugs and collection names are validated to prevent path traversal.

use once_cell::sync::Lazy;
use regex::Regex;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::RwLock;

static SAFE_NAME: Lazy<Regex> = Lazy::new(|| {
    Regex::new(r"^[a-z0-9]([a-z0-9-]*[a-z0-9])?$").unwrap()
});

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Document {
    #[serde(default)]
    pub id: String,
    pub slug: String,
    pub status: String,
    #[serde(default)]
    pub locale: Option<String>,
    #[serde(default, rename = "translationGroup")]
    pub translation_group: Option<String>,
    #[serde(default)]
    pub data: HashMap<String, serde_json::Value>,
    #[serde(default, rename = "createdAt")]
    pub created_at: Option<String>,
    #[serde(default, rename = "updatedAt")]
    pub updated_at: Option<String>,
}

impl Document {
    pub fn is_published(&self) -> bool {
        self.status == "published"
    }

    pub fn string(&self, key: &str) -> String {
        self.data.get(key)
            .and_then(|v| v.as_str())
            .map(|s| s.to_string())
            .unwrap_or_default()
    }

    pub fn string_or(&self, key: &str, default: &str) -> String {
        let v = self.string(key);
        if v.is_empty() { default.to_string() } else { v }
    }
}

#[derive(Debug)]
pub enum WebhouseError {
    InvalidName(String),
    Io(std::io::Error),
    Parse(serde_json::Error),
}

impl std::fmt::Display for WebhouseError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::InvalidName(n) => write!(f, "invalid name '{}'", n),
            Self::Io(e) => write!(f, "io error: {}", e),
            Self::Parse(e) => write!(f, "json parse error: {}", e),
        }
    }
}

impl std::error::Error for WebhouseError {}

pub struct Reader {
    content_dir: PathBuf,
    globals_cache: RwLock<Option<Document>>,
}

impl Reader {
    pub fn new<P: AsRef<Path>>(content_dir: P) -> Self {
        Self {
            content_dir: content_dir.as_ref().canonicalize()
                .unwrap_or_else(|_| content_dir.as_ref().to_path_buf()),
            globals_cache: RwLock::new(None),
        }
    }

    pub fn collection(&self, name: &str, locale: Option<&str>) -> Result<Vec<Document>, WebhouseError> {
        validate(name)?;
        let dir = self.content_dir.join(name);
        if !dir.is_dir() {
            return Ok(Vec::new());
        }

        let mut docs = Vec::new();
        for entry in fs::read_dir(&dir).map_err(WebhouseError::Io)? {
            let entry = entry.map_err(WebhouseError::Io)?;
            let path = entry.path();
            if path.extension().and_then(|s| s.to_str()) != Some("json") {
                continue;
            }
            let raw = match fs::read_to_string(&path) {
                Ok(s) => s,
                Err(_) => continue,
            };
            let doc: Document = match serde_json::from_str(&raw) {
                Ok(d) => d,
                Err(_) => continue,
            };
            if !doc.is_published() {
                continue;
            }
            if let Some(loc) = locale {
                if doc.locale.as_deref() != Some(loc) {
                    continue;
                }
            }
            docs.push(doc);
        }

        docs.sort_by(|a, b| b.string_or("date", "").cmp(&a.string_or("date", "")));
        Ok(docs)
    }

    pub fn document(&self, collection: &str, slug: &str) -> Result<Option<Document>, WebhouseError> {
        validate(collection)?;
        validate(slug)?;

        let path = self.content_dir.join(collection).join(format!("{}.json", slug));
        let canonical = match path.canonicalize() {
            Ok(p) => p,
            Err(_) => return Ok(None),
        };
        if !canonical.starts_with(&self.content_dir) {
            return Err(WebhouseError::InvalidName(slug.to_string()));
        }

        let raw = fs::read_to_string(&canonical).map_err(WebhouseError::Io)?;
        let doc: Document = serde_json::from_str(&raw).map_err(WebhouseError::Parse)?;
        if !doc.is_published() {
            return Ok(None);
        }
        Ok(Some(doc))
    }

    pub fn find_translation(&self, doc: &Document, collection: &str) -> Result<Option<Document>, WebhouseError> {
        let tg = match &doc.translation_group {
            Some(t) => t,
            None => return Ok(None),
        };
        let all = self.collection(collection, None)?;
        Ok(all.into_iter().find(|other| {
            other.translation_group.as_deref() == Some(tg.as_str())
                && other.locale != doc.locale
        }))
    }

    pub fn globals(&self) -> Document {
        {
            let cache = self.globals_cache.read().unwrap();
            if let Some(g) = cache.as_ref() {
                return g.clone();
            }
        }
        let g = self.document("globals", "site").ok().flatten().unwrap_or_else(|| Document {
            id: String::new(),
            slug: "site".to_string(),
            status: "published".to_string(),
            locale: None,
            translation_group: None,
            data: HashMap::new(),
            created_at: None,
            updated_at: None,
        });
        *self.globals_cache.write().unwrap() = Some(g.clone());
        g
    }
}

fn validate(name: &str) -> Result<(), WebhouseError> {
    if !SAFE_NAME.is_match(name) {
        return Err(WebhouseError::InvalidName(name.to_string()));
    }
    Ok(())
}
