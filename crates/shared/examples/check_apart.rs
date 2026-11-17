//! Which vehicles the tablet's apart file names, by hash (and which of the coaches it does).
use std::path::Path;

fn main() {
    let game = std::env::args().nth(1).unwrap_or_else(|| "eut2".into());
    let dir = Path::new(r"C:\Users\28160\Documents\WestPlay");
    let file = dir.join(westplay_shared::tablet_apart_file(&game));
    let text = std::fs::read_to_string(&file).expect("apart file");
    let marks = westplay_shared::read_marks(&text);
    println!("  {} marks", marks.len());
    // The coaches and trucks to test.
    let ids = [
        "vehicle.t16shd", "vehicle.setradt531", "vehicle.manlions",
        "vehicle.scania.touring_23", "vehicle.man.lions_24",
        "vehicle.man.tgx_2020", "vehicle.scania.s_2016", "vehicle.scania.r_2016",
        "vehicle.man.lions_coach", "vehicle.scania.touring",
    ];
    for id in ids {
        println!("    {id:32} {}", if westplay_shared::vehicle_marked(id, &marks) { "APART (平板空白)" } else { "-" });
    }
}
