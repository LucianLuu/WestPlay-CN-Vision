//! Lists the MAN TGX 2020's interiors in the game, and where they point for the GPS page.
use std::path::Path;
use westplay_mapdata::files::GameFiles;

fn main() {
    let dir = std::env::args().nth(1).expect("game dir");
    let files = GameFiles::install(Path::new(&dir)).expect("game files");
    let entries = files.list("def/vehicle/truck/man.tgx_2020/interior").expect("list");
    println!("  interiors: {entries:?}");
    for entry in &entries {
        let path = format!("def/vehicle/truck/man.tgx_2020/interior/{entry}");
        if let Ok(Some(bytes)) = files.read(&path) {
            let text = String::from_utf8_lossy(&bytes);
            for line in text.lines() {
                if line.contains("gps") || line.contains("display") {
                    println!("  {entry}: {}", line.trim());
                }
            }
        }
    }
}
