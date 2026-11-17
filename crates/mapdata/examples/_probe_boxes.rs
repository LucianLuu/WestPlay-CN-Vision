//! Temporary probe (deleted after use): which pack puts mirror-reflection images on a screen?

use westplay_mapdata::archive::Archive;
use std::path::{Path, PathBuf};

fn packs(root: &Path, out: &mut Vec<PathBuf>) {
    let Ok(entries) = std::fs::read_dir(root) else { return };
    for entry in entries.flatten() {
        let path = entry.path();
        if path.is_dir() {
            packs(&path, out);
        } else if matches!(path.extension().and_then(|e| e.to_str()), Some("scs" | "zip")) {
            out.push(path);
        }
    }
}

fn sii_hits(archive: &Archive, dir: &str, depth: usize, out: &mut Vec<(String, String)>) {
    if depth > 5 {
        return;
    }
    let Ok(Some(listing)) = archive.list(dir) else { return };
    for file in &listing.files {
        let path = if dir.is_empty() { file.clone() } else { format!("{dir}/{file}") };
        if !path.ends_with(".sii") {
            continue;
        }
        if let Ok(Some(bytes)) = archive.read(&path) {
            let text = String::from_utf8_lossy(&bytes).to_string();
            if text.contains("mirror_reflection") && !text.contains("westplay") {
                out.push((path, text));
            }
        }
    }
    for child in &listing.dirs {
        let path = if dir.is_empty() { child.clone() } else { format!("{dir}/{child}") };
        sii_hits(archive, &path, depth + 1, out);
    }
}

fn main() {
    let roots = [
        PathBuf::from(r"E:\SteamLibrary\steamapps\workshop\content\227300"),
        PathBuf::from(r"C:\Users\Administrator\Documents\Euro Truck Simulator 2\mod"),
    ];
    let mut found = Vec::new();
    for root in &roots {
        packs(root, &mut found);
    }
    println!("{} packs", found.len());
    for pack in &found {
        let Ok(archive) = Archive::open(pack) else { continue };
        let mut hits = Vec::new();
        sii_hits(&archive, "ui", 0, &mut hits);
        if hits.is_empty() {
            continue;
        }
        let zip = std::fs::File::open(pack).ok().and_then(|_| None::<()>);
        let _ = zip;
        println!("\n=== {} ({} hits)", pack.display(), hits.len());
        for (path, _) in &hits {
            println!("  file: {path}");
        }
        for (path, text) in &hits {
            println!("--- {path}");
            for line in text.lines().filter(|line| {
                line.contains("mirror_reflection")
                    || line.contains("ui::text :")
                    || line.contains(" layer:")
                    || line.contains(" coords_")
                    || line.contains(" my_parent")
            }) {
                println!("   {}", line.trim());
            }
        }
    }
}