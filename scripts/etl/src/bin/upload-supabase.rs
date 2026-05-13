// Upload public/resorts/*.json to Supabase Storage.
//
// Usage:
//   SUPABASE_URL=https://<ref>.supabase.co \
//   SUPABASE_SERVICE_ROLE_KEY=… \
//   SUPABASE_BUCKET=resorts \
//     cargo run --release --bin upload-supabase
//
// Uses the Storage REST API with x-upsert: true, so re-runs overwrite
// (idempotent). Concurrency is 8 + exponential backoff on 429/5xx.

use anyhow::{anyhow, Context, Result};
use futures_util::{stream, StreamExt};
use indicatif::{ProgressBar, ProgressStyle};
use reqwest::{header, Client};
use std::path::PathBuf;
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::Arc;
use std::time::Duration;

const CONCURRENCY: usize = 8;
const MAX_RETRIES: usize = 4;

#[tokio::main]
async fn main() -> Result<()> {
    let supabase_url = std::env::var("SUPABASE_URL")
        .context("SUPABASE_URL not set (e.g. https://<ref>.supabase.co)")?
        .trim_end_matches('/')
        .to_string();
    let service_key = std::env::var("SUPABASE_SERVICE_ROLE_KEY")
        .context("SUPABASE_SERVICE_ROLE_KEY not set")?;
    let bucket = std::env::var("SUPABASE_BUCKET").unwrap_or_else(|_| "resorts".to_string());

    let crate_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    let resorts_dir = crate_dir.join("../../public/resorts");
    let resorts_dir = resorts_dir.canonicalize().with_context(|| {
        format!("public/resorts not found at {}", resorts_dir.display())
    })?;

    let mut files = Vec::new();
    let mut rd = tokio::fs::read_dir(&resorts_dir).await?;
    while let Some(entry) = rd.next_entry().await? {
        let path = entry.path();
        if path.extension().and_then(|s| s.to_str()) == Some("json") {
            files.push(path);
        }
    }
    files.sort();
    let total = files.len();
    println!(
        "Uploading {total} files to bucket '{bucket}' on {supabase_url}",
    );

    let client = Client::builder()
        .timeout(Duration::from_secs(60))
        .pool_idle_timeout(Duration::from_secs(30))
        .build()?;

    let pb = ProgressBar::new(total as u64);
    pb.set_style(
        ProgressStyle::with_template(
            "[{elapsed_precise}] {bar:40.cyan/blue} {pos}/{len} {msg}",
        )?
        .progress_chars("##-"),
    );

    let supabase_url = Arc::new(supabase_url);
    let service_key = Arc::new(service_key);
    let bucket = Arc::new(bucket);
    let uploaded = Arc::new(AtomicUsize::new(0));
    let failed = Arc::new(AtomicUsize::new(0));

    stream::iter(files.into_iter().map(|path| {
        let client = client.clone();
        let supabase_url = Arc::clone(&supabase_url);
        let service_key = Arc::clone(&service_key);
        let bucket = Arc::clone(&bucket);
        let pb = pb.clone();
        let uploaded = Arc::clone(&uploaded);
        let failed = Arc::clone(&failed);
        async move {
            let name = path.file_name().and_then(|s| s.to_str()).unwrap_or("").to_string();
            match upload_one(&client, &supabase_url, &service_key, &bucket, &path, &name).await {
                Ok(()) => {
                    uploaded.fetch_add(1, Ordering::Relaxed);
                }
                Err(e) => {
                    failed.fetch_add(1, Ordering::Relaxed);
                    let msg = format!("  ✗ {name}: {e:#}");
                    pb.println(&msg);
                    eprintln!("{msg}");
                }
            }
            pb.inc(1);
            pb.set_message(format!(
                "✓ {} · fail {}",
                uploaded.load(Ordering::Relaxed),
                failed.load(Ordering::Relaxed),
            ));
        }
    }))
    .buffer_unordered(CONCURRENCY)
    .for_each(|_| async {})
    .await;

    pb.finish_and_clear();
    println!(
        "Done. uploaded={} failed={}",
        uploaded.load(Ordering::Relaxed),
        failed.load(Ordering::Relaxed),
    );
    if failed.load(Ordering::Relaxed) > 0 {
        return Err(anyhow!("some uploads failed — rerun to retry"));
    }
    Ok(())
}

async fn upload_one(
    client: &Client,
    supabase_url: &str,
    service_key: &str,
    bucket: &str,
    path: &std::path::Path,
    name: &str,
) -> Result<()> {
    let body = tokio::fs::read(path).await?;
    let url = format!("{supabase_url}/storage/v1/object/{bucket}/{name}");

    let mut delay_ms = 500u64;
    for attempt in 0..=MAX_RETRIES {
        let resp = client
            .post(&url)
            .header(header::AUTHORIZATION, format!("Bearer {service_key}"))
            .header(header::CONTENT_TYPE, "application/json")
            .header("x-upsert", "true")
            .header("cache-control", "public, max-age=31536000, immutable")
            .body(body.clone())
            .send()
            .await;

        match resp {
            Ok(r) if r.status().is_success() => return Ok(()),
            Ok(r) => {
                let status = r.status();
                let text = r.text().await.unwrap_or_default();
                let retriable = status.as_u16() == 429 || status.is_server_error();
                if !retriable || attempt == MAX_RETRIES {
                    return Err(anyhow!("POST {name} failed: {status} {text}"));
                }
            }
            Err(e) => {
                if attempt == MAX_RETRIES {
                    return Err(anyhow!("POST {name} transport error: {e}"));
                }
            }
        }
        tokio::time::sleep(Duration::from_millis(delay_ms)).await;
        delay_ms = (delay_ms * 2).min(8000);
    }
    unreachable!()
}
