// Upload public/resorts/*.json to Vercel Blob.
//
// Usage:
//   BLOB_READ_WRITE_TOKEN=… BLOB_PUBLIC_BASE_URL=https://<id>.public.blob.vercel-storage.com \
//     cargo run --release --bin upload-blobs
//
// Resumable: skips files already present at the public URL.
// Stable filenames: passes x-add-random-suffix: 0 so we get
//   {BASE}/resorts/{slug}.json — the same shape we already fetch in the app.

use anyhow::{anyhow, Context, Result};
use futures_util::{stream, StreamExt};
use indicatif::{ProgressBar, ProgressStyle};
use reqwest::{header, Client, StatusCode};
use std::path::PathBuf;
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::Arc;
use std::time::Duration;

const CONCURRENCY: usize = 24;
const BLOB_API: &str = "https://blob.vercel-storage.com";
const PATH_PREFIX: &str = "resorts";

#[tokio::main]
async fn main() -> Result<()> {
    let token = std::env::var("BLOB_READ_WRITE_TOKEN")
        .context("BLOB_READ_WRITE_TOKEN not set (vercel env pull .env.local, then export it)")?;
    let public_base = std::env::var("BLOB_PUBLIC_BASE_URL")
        .context("BLOB_PUBLIC_BASE_URL not set (e.g. https://<id>.public.blob.vercel-storage.com)")?
        .trim_end_matches('/')
        .to_string();

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
    println!("Found {total} resort blobs in {}", resorts_dir.display());

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

    let token = Arc::new(token);
    let public_base = Arc::new(public_base);
    let skipped = Arc::new(AtomicUsize::new(0));
    let uploaded = Arc::new(AtomicUsize::new(0));
    let failed = Arc::new(AtomicUsize::new(0));

    stream::iter(files.into_iter().map(|path| {
        let client = client.clone();
        let token = Arc::clone(&token);
        let public_base = Arc::clone(&public_base);
        let pb = pb.clone();
        let skipped = Arc::clone(&skipped);
        let uploaded = Arc::clone(&uploaded);
        let failed = Arc::clone(&failed);
        async move {
            let name = path.file_name().and_then(|s| s.to_str()).unwrap_or("").to_string();
            let pathname = format!("{PATH_PREFIX}/{name}");
            let public_url = format!("{public_base}/{pathname}");

            match upload_one(&client, &token, &path, &pathname, &public_url).await {
                Ok(UploadOutcome::Uploaded) => {
                    uploaded.fetch_add(1, Ordering::Relaxed);
                }
                Ok(UploadOutcome::Skipped) => {
                    skipped.fetch_add(1, Ordering::Relaxed);
                }
                Err(e) => {
                    failed.fetch_add(1, Ordering::Relaxed);
                    pb.println(format!("  ✗ {name}: {e:#}"));
                }
            }
            pb.inc(1);
            pb.set_message(format!(
                "✓ {} · skip {} · fail {}",
                uploaded.load(Ordering::Relaxed),
                skipped.load(Ordering::Relaxed),
                failed.load(Ordering::Relaxed),
            ));
        }
    }))
    .buffer_unordered(CONCURRENCY)
    .for_each(|_| async {})
    .await;

    pb.finish_and_clear();
    println!(
        "Done. uploaded={} skipped={} failed={}",
        uploaded.load(Ordering::Relaxed),
        skipped.load(Ordering::Relaxed),
        failed.load(Ordering::Relaxed),
    );
    if failed.load(Ordering::Relaxed) > 0 {
        return Err(anyhow!("some uploads failed — rerun to retry"));
    }
    Ok(())
}

enum UploadOutcome {
    Uploaded,
    Skipped,
}

async fn upload_one(
    client: &Client,
    token: &str,
    path: &std::path::Path,
    pathname: &str,
    public_url: &str,
) -> Result<UploadOutcome> {
    let head = client.head(public_url).send().await?;
    if head.status() == StatusCode::OK {
        return Ok(UploadOutcome::Skipped);
    }

    let body = tokio::fs::read(path).await?;

    let put_url = format!("{BLOB_API}/{pathname}");
    let resp = client
        .put(&put_url)
        .header(header::AUTHORIZATION, format!("Bearer {token}"))
        .header("x-api-version", "7")
        .header("x-content-type", "application/json")
        .header("x-add-random-suffix", "0")
        .header("x-cache-control-max-age", "31536000")
        .body(body)
        .send()
        .await?;

    let status = resp.status();
    if !status.is_success() {
        let text = resp.text().await.unwrap_or_default();
        return Err(anyhow!("PUT {pathname} failed: {status} {text}"));
    }
    Ok(UploadOutcome::Uploaded)
}
