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

const CONCURRENCY: usize = 8;
const MAX_RETRIES: usize = 4;
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
                    let msg = format!("  ✗ {name}: {e:#}");
                    pb.println(&msg);
                    eprintln!("{msg}");
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
    let _ = public_url;

    // Existence check via the authenticated API endpoint — the public hostname
    // may be unreachable from this network, but blob.vercel-storage.com is fine.
    let api_url = format!("{BLOB_API}/{pathname}");
    let head = client
        .head(&api_url)
        .header(header::AUTHORIZATION, format!("Bearer {token}"))
        .header("x-api-version", "7")
        .timeout(Duration::from_secs(8))
        .send()
        .await;
    if matches!(head, Ok(ref r) if r.status() == StatusCode::OK) {
        return Ok(UploadOutcome::Skipped);
    }

    let body = tokio::fs::read(path).await?;

    let mut delay_ms = 500u64;
    for attempt in 0..=MAX_RETRIES {
        let resp = client
            .put(&api_url)
            .header(header::AUTHORIZATION, format!("Bearer {token}"))
            .header("x-api-version", "7")
            .header("x-content-type", "application/json")
            .header("x-add-random-suffix", "0")
            .header("x-cache-control-max-age", "31536000")
            .body(body.clone())
            .send()
            .await;

        match resp {
            Ok(r) if r.status().is_success() => return Ok(UploadOutcome::Uploaded),
            Ok(r) => {
                let status = r.status();
                let text = r.text().await.unwrap_or_default();
                let retriable = status.as_u16() == 429 || status.is_server_error();
                if !retriable || attempt == MAX_RETRIES {
                    return Err(anyhow!("PUT {pathname} failed: {status} {text}"));
                }
            }
            Err(e) => {
                if attempt == MAX_RETRIES {
                    return Err(anyhow!("PUT {pathname} transport error: {e}"));
                }
            }
        }
        tokio::time::sleep(Duration::from_millis(delay_ms)).await;
        delay_ms = (delay_ms * 2).min(8000);
    }
    unreachable!()
}
