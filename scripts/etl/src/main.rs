// Schuss ETL: Rust port of scripts/build-resort-data.ts.
//
// Phases match the original byte-for-byte where possible:
//   --geojson   download OpenSkiMap, write public/resorts/{slug}.json
//   --index     write resorts.json (preserving image fields from prior run)
//   --images    fill `image` / `imageAttribution` via Wikidata + Wikipedia
//   --refresh   together with --images, overwrite existing image fields

use anyhow::{anyhow, Context, Result};
use clap::Parser;
use futures_util::{stream, StreamExt};
use indicatif::{ProgressBar, ProgressStyle};
use serde::{Deserialize, Serialize};
use serde_json::{json, Map as JsonMap, Value};
use std::collections::{HashMap, HashSet};
use std::path::PathBuf;
use std::sync::LazyLock;
use std::time::Duration;
use tokio::fs;
use unicode_normalization::UnicodeNormalization;

// ──────────────────────────────────────────────────────────────── slugify ──

/// Mirrors `lib/utils.ts#slugify`:
///   lowercase → NFD-decompose → strip combining marks → non-alphanumeric → '-'
///   → trim leading/trailing dashes; consecutive non-alphanums collapse to a single '-'.
fn slugify(input: &str) -> String {
    let mut out = String::with_capacity(input.len());
    let mut last_was_dash = true;
    for c in input.to_lowercase().nfd().filter(|c| !is_combining_mark(*c)) {
        if c.is_ascii_alphanumeric() {
            out.push(c);
            last_was_dash = false;
        } else if !last_was_dash {
            out.push('-');
            last_was_dash = true;
        }
    }
    while out.ends_with('-') {
        out.pop();
    }
    out
}

// Major combining-mark blocks (Unicode category Mn). Covers Latin diacritics
// plus the long-tail blocks used by non-Latin scripts.
fn is_combining_mark(c: char) -> bool {
    let cp = c as u32;
    matches!(
        cp,
        0x0300..=0x036F | 0x1AB0..=0x1AFF | 0x1DC0..=0x1DFF | 0x20D0..=0x20FF | 0xFE20..=0xFE2F
    )
}

// ────────────────────────────────────────────────────────────── constants ──

static EUROPE_CODES: LazyLock<HashSet<&'static str>> = LazyLock::new(|| {
    [
        "AD", "AL", "AM", "AT", "AZ", "BA", "BG", "BY", "CH", "CZ", "DE", "DK", "EE", "ES", "FI",
        "FO", "FR", "GB", "GE", "GR", "HR", "HU", "IS", "IT", "LI", "LT", "LV", "ME", "MK", "NO",
        "PL", "RO", "RS", "RU", "SE", "SI", "SK", "TR", "UA",
    ]
    .into_iter()
    .collect()
});

// ───────────────────────────────────────────────────────── paths & progress ──

/// Walks up from CARGO_MANIFEST_DIR looking for the schuss repo root —
/// identified by the top-level `package.json` whose name is "schuss".
fn repo_root() -> Result<PathBuf> {
    let manifest_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    let mut cursor = manifest_dir.as_path();
    loop {
        let candidate = cursor.join("package.json");
        if candidate.is_file() {
            if let Ok(bytes) = std::fs::read(&candidate) {
                if let Ok(json) = serde_json::from_slice::<Value>(&bytes) {
                    if json.get("name").and_then(|v| v.as_str()) == Some("schuss") {
                        return Ok(cursor.to_path_buf());
                    }
                }
            }
        }
        cursor = cursor
            .parent()
            .ok_or_else(|| anyhow!("could not find schuss repo root from {}", manifest_dir.display()))?;
    }
}

fn public_resorts_dir() -> Result<PathBuf> {
    Ok(repo_root()?.join("public").join("resorts"))
}

fn index_path() -> Result<PathBuf> {
    Ok(repo_root()?.join("resorts.json"))
}

fn make_progress(total: u64, msg: impl Into<String>) -> ProgressBar {
    let pb = ProgressBar::new(total);
    pb.set_style(
        ProgressStyle::with_template(
            "[{bar:30.cyan/blue}] {percent:>3}% {pos}/{len} · {msg} · {elapsed_precise} elapsed · ETA {eta_precise}",
        )
        .unwrap()
        .progress_chars("█░ "),
    );
    pb.set_message(msg.into());
    pb.enable_steady_tick(Duration::from_millis(150));
    pb
}

const UA: &str = "schuss/0.1 (francisco@tree-nation.com)";
const SOURCE_SKI_AREAS: &str = "https://tiles.openskimap.org/geojson/ski_areas.geojson";
const SOURCE_RUNS: &str = "https://tiles.openskimap.org/geojson/runs.geojson";
const SOURCE_LIFTS: &str = "https://tiles.openskimap.org/geojson/lifts.geojson";
const IMAGE_CONCURRENCY: usize = 4;
const IMAGE_SLEEP_MS: u64 = 100;
const IMAGE_FLUSH_EVERY: usize = 50;

#[derive(Parser, Debug)]
#[command(version, about = "Build/refresh resort data from OpenSkiMap")]
struct Cli {
    /// Re-download GeoJSON and rewrite per-resort files
    #[arg(long)]
    geojson: bool,
    /// Rebuild resorts.json from sources
    #[arg(long)]
    index: bool,
    /// Fill missing images
    #[arg(long)]
    images: bool,
    /// With --images: also overwrite existing image URLs
    #[arg(long, alias = "refresh-images")]
    refresh: bool,
}

#[tokio::main(flavor = "multi_thread", worker_threads = 4)]
async fn main() -> Result<()> {
    let cli = Cli::parse();
    let all_off = !cli.geojson && !cli.index && !cli.images;
    let (run_geojson, run_index, run_images) =
        (all_off || cli.geojson, all_off || cli.index, all_off || cli.images);

    println!(
        "Phases: geojson={run_geojson} index={run_index} images={run_images}{}",
        if cli.refresh { " (refresh)" } else { "" }
    );

    let client = reqwest::Client::builder()
        .user_agent(UA)
        .timeout(Duration::from_secs(120))
        .build()?;

    let mut per_areas: Option<Vec<PerArea>> = None;
    if run_geojson {
        per_areas = Some(phase_geojson(&client).await?);
    }
    if run_index {
        let p = match per_areas.take() {
            Some(p) => p,
            None => phase_geojson(&client).await?,
        };
        phase_index(p).await?;
    }
    if run_images {
        phase_images(&client, cli.refresh).await?;
    }

    Ok(())
}

// ─────────────────────────────────────────────────────────── data shapes ──

#[derive(Debug)]
struct PerArea {
    id: String,
    slug: String,
    name: String,
    props: JsonMap<String, Value>,
    bbox: BBox,
    run_count: usize,
    lift_count: usize,
}

#[derive(Debug, Clone, Copy)]
struct BBox {
    w: f64,
    s: f64,
    e: f64,
    n: f64,
    any: bool,
}

impl BBox {
    fn new() -> Self {
        Self {
            w: f64::INFINITY,
            s: f64::INFINITY,
            e: f64::NEG_INFINITY,
            n: f64::NEG_INFINITY,
            any: false,
        }
    }
    fn visit(&mut self, lon: f64, lat: f64) {
        if !(lon.is_finite() && lat.is_finite()) {
            return;
        }
        self.any = true;
        self.w = self.w.min(lon);
        self.e = self.e.max(lon);
        self.s = self.s.min(lat);
        self.n = self.n.max(lat);
    }
    fn walk_geometry(&mut self, geom: &Value) {
        let Some(coords) = geom.get("coordinates") else { return };
        self.walk_coords(coords);
    }
    /// Recursively descend a GeoJSON coordinates value. A leaf is a [lon, lat]
    /// pair (two numbers); anything else is an array we recurse into. This
    /// handles Point / LineString / Polygon / Multi* uniformly.
    fn walk_coords(&mut self, v: &Value) {
        let Some(arr) = v.as_array() else { return };
        if let (Some(lon), Some(lat)) = (arr.first().and_then(Value::as_f64), arr.get(1).and_then(Value::as_f64)) {
            if arr.iter().all(|x| x.is_number()) {
                self.visit(lon, lat);
                return;
            }
        }
        for c in arr {
            self.walk_coords(c);
        }
    }
    fn into_bbox(self) -> Option<[f64; 4]> {
        self.any.then_some([self.w, self.s, self.e, self.n])
    }
    fn merge(&mut self, other: &BBox) {
        if !other.any {
            return;
        }
        self.any = true;
        self.w = self.w.min(other.w);
        self.e = self.e.max(other.e);
        self.s = self.s.min(other.s);
        self.n = self.n.max(other.n);
    }
}

// ─────────────────────────────────────────────────────────── geojson phase ──

async fn fetch_json(client: &reqwest::Client, url: &str) -> Result<Value> {
    println!("Fetching {url}…");
    Ok(client.get(url).send().await?.error_for_status()?.json().await?)
}

/// Stream `features` from a fetched GeoJSON, attaching `trim(feature)` to each
/// matching ski-area id and merging the bbox.
fn ingest_features<F>(
    json: &Value,
    area_by_id: &HashMap<String, JsonMap<String, Value>>,
    by_area: &mut HashMap<String, Vec<Value>>,
    bbox_by_area: &mut HashMap<String, BBox>,
    trim: F,
) where
    F: Fn(&Value) -> Value,
{
    let Some(features) = json.get("features").and_then(|v| v.as_array()) else { return };
    for f in features {
        let area_ids = ski_area_ids(f);
        if area_ids.is_empty() {
            continue;
        }
        let trimmed = trim(f);
        let mut bbox = BBox::new();
        if let Some(geom) = f.get("geometry") {
            bbox.walk_geometry(geom);
        }
        for id in area_ids {
            if !area_by_id.contains_key(&id) {
                continue;
            }
            by_area.entry(id.clone()).or_default().push(trimmed.clone());
            bbox_by_area.entry(id).or_insert_with(BBox::new).merge(&bbox);
        }
    }
}

async fn phase_geojson(client: &reqwest::Client) -> Result<Vec<PerArea>> {
    let public_dir = public_resorts_dir()?;
    fs::create_dir_all(&public_dir).await?;

    // 1) Pass over ski_areas: filter to Europe, build areaById.
    let areas_json = fetch_json(client, SOURCE_SKI_AREAS).await?;
    let total_area_features = areas_json
        .get("features")
        .and_then(|v| v.as_array())
        .map(|a| a.len())
        .unwrap_or(0);

    let mut area_by_id: HashMap<String, JsonMap<String, Value>> = HashMap::new();
    let mut area_geom_bbox: HashMap<String, BBox> = HashMap::new();
    if let Some(features) = areas_json.get("features").and_then(|v| v.as_array()) {
        for f in features {
            let Some(props) = f.get("properties").and_then(|v| v.as_object()) else { continue };
            if !is_european(props) {
                continue;
            }
            let Some(id) = area_id(f, props) else { continue };
            let mut bbox = BBox::new();
            if let Some(geom) = f.get("geometry") {
                bbox.walk_geometry(geom);
            }
            area_by_id.insert(id.clone(), props.clone());
            area_geom_bbox.insert(id, bbox);
        }
    }
    println!("European ski areas: {} / {total_area_features}", area_by_id.len());
    drop(areas_json);

    // 2) Pass over runs and lifts: trim features and bucket by ski-area id.
    let mut runs_by_area: HashMap<String, Vec<Value>> = HashMap::new();
    let mut runs_bbox: HashMap<String, BBox> = HashMap::new();
    let runs_json = fetch_json(client, SOURCE_RUNS).await?;
    ingest_features(&runs_json, &area_by_id, &mut runs_by_area, &mut runs_bbox, trim_run_feature);
    drop(runs_json);

    let mut lifts_by_area: HashMap<String, Vec<Value>> = HashMap::new();
    let mut lifts_bbox: HashMap<String, BBox> = HashMap::new();
    let lifts_json = fetch_json(client, SOURCE_LIFTS).await?;
    ingest_features(&lifts_json, &area_by_id, &mut lifts_by_area, &mut lifts_bbox, trim_lift_feature);
    drop(lifts_json);

    // 3) For each ski area: pick a slug, write file, build PerArea entry.
    //    Iterate in a deterministic order so collision suffixes are stable.
    let mut area_ids_sorted: Vec<String> = area_by_id.keys().cloned().collect();
    area_ids_sorted.sort();

    let mut used_slugs: HashSet<String> = HashSet::new();
    let mut skipped_nameless = 0usize;
    let mut skipped_empty = 0usize;
    let mut out: Vec<PerArea> = Vec::new();
    let pb = make_progress(area_ids_sorted.len() as u64, "");

    for id in &area_ids_sorted {
        let props = area_by_id.get(id).expect("present").clone();
        let name = props
            .get("name")
            .and_then(|v| v.as_str())
            .map(|s| s.trim().to_string())
            .filter(|s| !s.is_empty());
        let Some(name) = name else {
            skipped_nameless += 1;
            pb.inc(1);
            continue;
        };

        let slug = dedupe_slug(slugify(&name), id, &mut used_slugs);

        let runs = runs_by_area.remove(id).unwrap_or_default();
        let lifts = lifts_by_area.remove(id).unwrap_or_default();
        if runs.is_empty() && lifts.is_empty() {
            skipped_empty += 1;
            pb.inc(1);
            continue;
        }

        let (run_count, lift_count) = (runs.len(), lifts.len());

        let payload = json!({
            "runs":  { "type": "FeatureCollection", "features": runs },
            "lifts": { "type": "FeatureCollection", "features": lifts },
        });
        let path = public_dir.join(format!("{slug}.json"));
        let body = serde_json::to_vec(&payload)?;
        fs::write(&path, body).await.with_context(|| format!("writing {}", path.display()))?;

        let mut bbox = area_geom_bbox.remove(id).unwrap_or_else(BBox::new);
        if let Some(b) = runs_bbox.remove(id) {
            bbox.merge(&b);
        }
        if let Some(b) = lifts_bbox.remove(id) {
            bbox.merge(&b);
        }

        pb.set_message(name.clone());
        out.push(PerArea {
            id: id.clone(),
            slug,
            name,
            props,
            bbox,
            run_count,
            lift_count,
        });
        pb.inc(1);
    }
    pb.finish_and_clear();
    println!(
        "[geojson] wrote {} per-resort files ({skipped_nameless} unnamed skipped, {skipped_empty} empty skipped).",
        out.len()
    );
    Ok(out)
}

fn dedupe_slug(base: String, fallback_id: &str, used: &mut HashSet<String>) -> String {
    let mut slug = if base.is_empty() { fallback_id.to_string() } else { base };
    if used.contains(&slug) {
        let mut i = 2usize;
        while used.contains(&format!("{slug}-{i}")) {
            i += 1;
        }
        slug = format!("{slug}-{i}");
    }
    used.insert(slug.clone());
    slug
}

fn area_id(f: &Value, props: &JsonMap<String, Value>) -> Option<String> {
    props
        .get("id")
        .and_then(|v| v.as_str())
        .or_else(|| f.get("id").and_then(|v| v.as_str()))
        .map(str::to_string)
}

fn is_european(props: &JsonMap<String, Value>) -> bool {
    place_of(props)
        .and_then(|p| p.get("iso3166_1Alpha2"))
        .and_then(|v| v.as_str())
        .is_some_and(|cc| EUROPE_CODES.contains(cc))
}

fn place_of(props: &JsonMap<String, Value>) -> Option<&JsonMap<String, Value>> {
    props
        .get("places")
        .and_then(|v| v.as_array())
        .and_then(|a| a.first())
        .and_then(|v| v.as_object())
        .or_else(|| props.get("location").and_then(|v| v.as_object()))
}

fn ski_area_ids(f: &Value) -> Vec<String> {
    let Some(arr) = f
        .get("properties")
        .and_then(|p| p.get("skiAreas"))
        .and_then(|v| v.as_array())
    else {
        return Vec::new();
    };
    arr.iter()
        .filter_map(|entry| {
            entry.as_str().map(str::to_string).or_else(|| {
                entry
                    .get("properties")
                    .and_then(|p| p.get("id"))
                    .and_then(|v| v.as_str())
                    .map(str::to_string)
            })
        })
        .collect()
}

const DIFFICULTY_KEYS: &[&str] = &["novice", "easy", "intermediate", "advanced", "expert", "freeride", "other"];

/// Build a Feature skeleton (type/id/geometry) and attach the given properties.
fn make_feature(f: &Value, new_props: JsonMap<String, Value>) -> Value {
    let mut feat = JsonMap::new();
    feat.insert(
        "type".into(),
        f.get("type").cloned().unwrap_or_else(|| Value::String("Feature".into())),
    );
    if let Some(id) = f.get("id") {
        feat.insert("id".into(), id.clone());
    }
    if let Some(g) = f.get("geometry") {
        feat.insert("geometry".into(), g.clone());
    }
    feat.insert("properties".into(), Value::Object(new_props));
    Value::Object(feat)
}

fn trim_run_feature(f: &Value) -> Value {
    let props = f.get("properties").and_then(|v| v.as_object());
    let name = props.and_then(|p| p.get("name")).cloned().unwrap_or(Value::Null);
    let r#ref = props.and_then(|p| p.get("ref")).cloned().unwrap_or(Value::Null);
    let raw_diff = props
        .and_then(|p| p.get("difficulty").or_else(|| p.get("piste_difficulty")))
        .and_then(|v| v.as_str())
        .map(str::to_lowercase)
        .unwrap_or_else(|| "other".into());
    let difficulty = if DIFFICULTY_KEYS.contains(&raw_diff.as_str()) { raw_diff } else { "other".into() };
    let mut np = JsonMap::new();
    np.insert("name".into(), name);
    np.insert("difficulty".into(), Value::String(difficulty));
    np.insert("ref".into(), r#ref);
    make_feature(f, np)
}

fn trim_lift_feature(f: &Value) -> Value {
    let props = f.get("properties").and_then(|v| v.as_object());
    let name = props.and_then(|p| p.get("name")).cloned().unwrap_or(Value::Null);
    let lift_type = props
        .and_then(|p| p.get("liftType").cloned().or_else(|| p.get("aerialway").cloned()))
        .unwrap_or(Value::Null);
    let mut np = JsonMap::new();
    np.insert("name".into(), name);
    np.insert("liftType".into(), lift_type);
    make_feature(f, np)
}

// ───────────────────────────────────────────────────────────── index phase ──

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
struct ResortIndexEntry {
    id: String,
    slug: String,
    name: String,
    country: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    region: Option<String>,
    bbox: [f64; 4],
    center: [f64; 2],
    #[serde(skip_serializing_if = "Option::is_none")]
    elevation_min: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    elevation_max: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    run_km: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    run_count: Option<usize>,
    #[serde(skip_serializing_if = "Option::is_none")]
    lift_count: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    image: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    image_attribution: Option<String>,
    #[serde(default, rename = "wikidataID")]
    wikidata_id: Option<String>,
}

async fn phase_index(per_areas: Vec<PerArea>) -> Result<Vec<ResortIndexEntry>> {
    let mut entries: Vec<ResortIndexEntry> = per_areas
        .into_iter()
        .filter_map(|a| {
            let bbox = a.bbox.into_bbox()?;
            let center = [(bbox[0] + bbox[2]) / 2.0, (bbox[1] + bbox[3]) / 2.0];
            let place = place_of(&a.props);
            let localized_en = place.and_then(|p| p.get("localized")).and_then(|v| v.get("en"));
            let country = localized_en
                .and_then(|v| v.get("country"))
                .and_then(|v| v.as_str())
                .unwrap_or("Europe")
                .to_string();
            let region = localized_en
                .and_then(|v| v.get("region"))
                .and_then(|v| v.as_str())
                .map(str::to_string);
            let wikidata_id = a.props.get("wikidataID").and_then(|v| v.as_str()).map(str::to_string);

            let stats = a.props.get("statistics");
            let elevation_min = stats.and_then(|s| s.get("minElevation")).and_then(|v| v.as_f64());
            let elevation_max = stats.and_then(|s| s.get("maxElevation")).and_then(|v| v.as_f64());
            let lift_count = (a.lift_count > 0)
                .then_some(a.lift_count as u64)
                .or_else(|| sum_lift_count(stats));

            Some(ResortIndexEntry {
                id: a.id,
                slug: a.slug,
                name: a.name,
                country,
                region,
                bbox,
                center,
                elevation_min,
                elevation_max,
                run_km: sum_run_km(stats),
                run_count: Some(a.run_count),
                lift_count,
                image: None,
                image_attribution: None,
                wikidata_id,
            })
        })
        .collect();

    entries.sort_by(|a, b| b.run_km.unwrap_or(0).cmp(&a.run_km.unwrap_or(0)));

    // Preserve image fields from any existing index.
    if let Ok(prev) = read_index().await {
        let by_slug: HashMap<String, (Option<String>, Option<String>)> = prev
            .into_iter()
            .map(|e| (e.slug, (e.image, e.image_attribution)))
            .collect();
        for e in &mut entries {
            if let Some((img, attr)) = by_slug.get(&e.slug) {
                if img.is_some() {
                    e.image = img.clone();
                    e.image_attribution = attr.clone();
                }
            }
        }
    }

    write_index(&entries).await?;
    println!("[index] wrote {} entries.", entries.len());
    Ok(entries)
}

fn sum_run_km(stats: Option<&Value>) -> Option<u64> {
    let by_activity = stats?.get("runs")?.get("byActivity")?.as_object()?;
    let total: f64 = by_activity
        .values()
        .filter_map(|activity| activity.get("byDifficulty").and_then(|v| v.as_object()))
        .flat_map(|by_diff| by_diff.values())
        .filter_map(|diff| diff.get("lengthInKm").and_then(|v| v.as_f64()))
        .sum();
    (total > 0.0).then_some(total.round() as u64)
}

fn sum_lift_count(stats: Option<&Value>) -> Option<u64> {
    let by_type = stats?.get("lifts")?.get("byType")?.as_object()?;
    let total: u64 = by_type
        .values()
        .filter_map(|t| t.get("count").and_then(|v| v.as_u64()))
        .sum();
    (total > 0).then_some(total)
}

async fn read_index() -> Result<Vec<ResortIndexEntry>> {
    let path = index_path()?;
    let bytes = fs::read(&path).await.with_context(|| format!("reading {}", path.display()))?;
    Ok(serde_json::from_slice(&bytes)?)
}

async fn write_index(entries: &[ResortIndexEntry]) -> Result<()> {
    let path = index_path()?;
    let body = serde_json::to_vec_pretty(entries)?;
    fs::write(&path, body).await?;
    Ok(())
}

// ──────────────────────────────────────────────────────────── images phase ──

async fn phase_images(client: &reqwest::Client, refresh: bool) -> Result<()> {
    let mut entries = read_index().await?;
    let total = entries.len();
    let to_process: Vec<(usize, String, Option<String>)> = entries
        .iter()
        .enumerate()
        .filter(|(_, e)| (refresh || e.image.is_none()) && !e.name.trim().is_empty())
        .map(|(i, e)| (i, e.name.clone(), e.wikidata_id.clone()))
        .collect();
    let work_count = to_process.len();
    println!(
        "[images] total: {total} · to process: {work_count}{}",
        if refresh { " (refresh mode)" } else { "" }
    );

    let pb = make_progress(work_count as u64, "imgs 0");

    let mut found = 0usize;
    let mut dirty = 0usize;

    let mut results = stream::iter(to_process.into_iter().map(|(idx, name, qid)| {
        let client = client.clone();
        let pb = pb.clone();
        async move {
            pb.set_message(format!("fetching: {name}"));
            let img = fetch_wikidata_image(&client, &name, qid.as_deref()).await;
            tokio::time::sleep(Duration::from_millis(IMAGE_SLEEP_MS)).await;
            (idx, img)
        }
    }))
    .buffer_unordered(IMAGE_CONCURRENCY);

    while let Some((idx, img)) = results.next().await {
        if let Some((url, attr)) = img {
            entries[idx].image = Some(url);
            entries[idx].image_attribution = Some(attr);
            found += 1;
            dirty += 1;
            pb.set_message(format!("imgs {found}"));
        }
        pb.inc(1);
        if dirty >= IMAGE_FLUSH_EVERY {
            write_index(&entries).await?;
            dirty = 0;
        }
    }

    write_index(&entries).await?;
    pb.finish_and_clear();
    println!("[images] found {found} of {work_count}.");
    Ok(())
}

async fn fetch_wikidata_image(
    client: &reqwest::Client,
    name: &str,
    wikidata_id: Option<&str>,
) -> Option<(String, String)> {
    if let Some(qid) = wikidata_id {
        if let Some(url) = wikidata_sparql_image(client, qid).await {
            return Some((url, "Wikidata / Wikimedia Commons".to_string()));
        }
    }
    wikipedia_summary_image(client, name)
        .await
        .map(|url| (url, "Wikipedia".to_string()))
}

async fn wikidata_sparql_image(client: &reqwest::Client, qid: &str) -> Option<String> {
    let sparql = format!("SELECT ?image WHERE {{ wd:{qid} wdt:P18 ?image. }} LIMIT 1");
    let url = format!(
        "https://query.wikidata.org/sparql?format=json&query={}",
        urlencoding(&sparql)
    );
    let res = client
        .get(&url)
        .header("Accept", "application/sparql-results+json")
        .send()
        .await
        .ok()?;
    if !res.status().is_success() {
        return None;
    }
    let json: Value = res.json().await.ok()?;
    json.get("results")?
        .get("bindings")?
        .as_array()?
        .first()?
        .get("image")?
        .get("value")?
        .as_str()
        .map(str::to_string)
}

async fn wikipedia_summary_image(client: &reqwest::Client, name: &str) -> Option<String> {
    let url = format!(
        "https://en.wikipedia.org/api/rest_v1/page/summary/{}",
        urlencoding(name)
    );
    let res = client.get(&url).send().await.ok()?;
    if !res.status().is_success() {
        return None;
    }
    let json: Value = res.json().await.ok()?;
    let pick = |key: &str| {
        json.get(key)
            .and_then(|v| v.get("source"))
            .and_then(|v| v.as_str())
            .map(str::to_string)
    };
    pick("originalimage").or_else(|| pick("thumbnail"))
}

fn urlencoding(s: &str) -> String {
    url::form_urlencoded::byte_serialize(s.as_bytes()).collect()
}
