//! Builds WestPlay's mod with its own MAN TGX 2020 script (and the interior pointing at it), so the
//! game's DLC script can't win: the DLC loads before the mod and the game kept its own screen.
use std::path::Path;
use westplay_mapdata::files::GameFiles;

fn main() {
    let dir = std::env::args().nth(1).expect("game dir");
    let out = std::env::args().nth(2).expect("mod dir");
    let files = GameFiles::install(Path::new(&dir)).expect("game files");
    let marks = westplay_setup::cab_mark::Marks::default();
    let empty = GameFiles::new(Vec::new());
    let (bytes, built) = westplay_setup::game_mod::build(&files, &[], &empty, &marks).expect("build");
    println!("  mod {} bytes, man patched: {}", bytes.len(), built.patched.contains(&"man-tgx-2020"));

    // The game's own MAN TGX 2020 GPS script, patched the same way, under WestPlay's own name; and the
    // interior that asks for that page, asking for this one instead.
    let ours = files
        .read("ui/dashboard/man_tgx_2020_gps.sii")
        .expect("read")
        .expect("the game's own script");
    let patched = westplay_setup::game_mod::patch_gps_script(
        &String::from_utf8_lossy(&ours),
        "screen_man_tgx_2020",
        None,
        720,
        &["100", "200"],
    )
    .expect("patch");
    let mut extra = vec![(
        "ui/dashboard/westplay_man_tgx_2020_gps.sii".to_owned(),
        patched.into_bytes(),
    )];
    let interior = files
        .read("def/vehicle/truck/man.tgx_2020/interior/computers.sui")
        .expect("read interior")
        .expect("the interior");
    let text = String::from_utf8_lossy(&interior).replace(
        "gps_path: \"/ui/dashboard/man_tgx_2020_gps.sii\"",
        "gps_path: \"/ui/dashboard/westplay_man_tgx_2020_gps.sii\"",
    );
    extra.push((
        "def/vehicle/truck/man.tgx_2020/interior/computers.sui".to_owned(),
        text.into_bytes(),
    ));
    println!("  extra files: {}", extra.len());

    let path = westplay_setup::game_mod::install_with(
        &bytes,
        &extra,
        Path::new(&out),
        westplay_setup::game::Kind::Ets2,
    )
    .expect("install");
    println!("  written: {}", path.display());
}
