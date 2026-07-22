fn check_api() {
    let b = tauri::Builder::default();
    b.register_uri_scheme_protocol("dlsniff", |_app, request| {
        tauri::http::Response::builder().status(200).body(Vec::new()).unwrap()
    });
}
