fn main() {
    tauri_build::build();

    // Embed the bundled Groq API key at compile time.
    // Set DOWNLINK_GROQ_KEY in your environment before building:
    //   DOWNLINK_GROQ_KEY=gsk_xxxx cargo build
    // If the env var is absent the app still works — users can set their own key.
    let key = std::env::var("DOWNLINK_GROQ_KEY").unwrap_or_default();
    println!("cargo:rustc-env=DOWNLINK_GROQ_KEY={key}");
    println!("cargo:rerun-if-env-changed=DOWNLINK_GROQ_KEY");
}
