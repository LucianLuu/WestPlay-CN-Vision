//! Extracts a file from an SCS archive (development aid, not shipped).
use std::path::PathBuf;

fn main() {
    let args: Vec<String> = std::env::args().collect();
    if args.len() < 3 {
        eprintln!("usage: extract_script <archive.scs> <path/in/archive> [out]");
        std::process::exit(2);
    }
    let archive = westplay_mapdata::archive::Archive::open(&PathBuf::from(&args[1]))
        .unwrap_or_else(|error| {
            eprintln!("open: {error:?}");
            std::process::exit(1);
        });
    eprintln!("entries: {}", archive.len());
    match archive.read(&args[2]) {
        Ok(Some(bytes)) => {
            eprintln!("read {} bytes", bytes.len());
            let out = args.get(3).cloned().unwrap_or_else(|| "extracted.out".into());
            std::fs::write(&out, &bytes).expect("write");
            eprintln!("wrote {out}");
        }
        Ok(None) => {
            eprintln!("not found: {}", args[2]);
            if let Ok(Some(listing)) = archive.list("ui/dashboard") {
                eprintln!("ui/dashboard: {} files", listing.files.len());
                for name in listing.files.iter().filter(|n| n.contains("gps") || n.contains("man")) {
                    eprintln!("  {name}");
                }
            }
            if let Ok(Some(listing)) = archive.list("ui") {
                eprintln!("ui: {} files, {} dirs", listing.files.len(), listing.dirs.len());
            }
            std::process::exit(1);
        }
        Err(error) => {
            eprintln!("read: {error:?}");
            std::process::exit(1);
        }
    }
}
