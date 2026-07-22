use serde_json::Value;

pub fn verbose_json_to_srt(json_str: &str) -> String {
    let mut srt = String::new();
    if let Ok(val) = serde_json::from_str::<Value>(json_str) {
        if let Some(segments) = val.get("segments").and_then(|v| v.as_array()) {
            for (i, seg) in segments.iter().enumerate() {
                let start = seg.get("start").and_then(|v| v.as_f64()).unwrap_or(0.0);
                let end = seg.get("end").and_then(|v| v.as_f64()).unwrap_or(0.0);
                let text = seg.get("text").and_then(|v| v.as_str()).unwrap_or("").trim();
                
                srt.push_str(&format!("{}\n", i + 1));
                srt.push_str(&format!("{} --> {}\n", format_timestamp(start), format_timestamp(end)));
                srt.push_str(&format!("{}\n\n", text));
            }
        }
    }
    srt.trim_end().to_string()
}

fn format_timestamp(seconds: f64) -> String {
    let hours = (seconds / 3600.0) as u64;
    let minutes = ((seconds % 3600.0) / 60.0) as u64;
    let secs = (seconds % 60.0) as u64;
    let millis = (seconds.fract() * 1000.0).round() as u64;
    format!("{:02}:{:02}:{:02},{:03}", hours, minutes, secs, millis)
}
fn main() {}
