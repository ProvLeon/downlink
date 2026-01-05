use std::collections::HashSet;

use regex::Regex;
use url::Url;

/// Extracts URLs from arbitrary text (e.g. multi-paste).
///
/// Behavior:
/// - Finds `http://` and `https://` URLs in the input, regardless of separators
/// - Trims common trailing punctuation like `)` `]` `,` `.`, etc.
/// - Normalizes URLs (scheme/host lowercasing, removes default ports, strips fragments)
/// - De-duplicates while preserving original order
///
/// Notes:
/// - We intentionally ignore non-http(s) schemes for safety and to match yt-dlp usage.
/// - We do not aggressively rewrite query strings.
pub fn extract_urls(text: &str) -> Vec<String> {
    let mut out: Vec<String> = Vec::new();
    let mut seen: HashSet<String> = HashSet::new();

    if text.trim().is_empty() {
        return out;
    }

    // Very forgiving URL matcher. We rely on `url::Url` to validate and normalize.
    // This intentionally stops at whitespace. We'll trim trailing punctuation after matching.
    //
    // Examples it should catch:
    // - https://example.com
    // - https://example.com/foo?bar=baz
    // - https://example.com/foo),   -> will be cleaned by `trim_trailing_punct`
    let re = match Regex::new(r"https?://[^\s]+") {
        Ok(r) => r,
        Err(_) => return out, // If regex fails to compile (shouldn't), fail safely.
    };

    for m in re.find_iter(text) {
        let raw = m.as_str();
        let cleaned = trim_trailing_punct(raw);

        if cleaned.is_empty() {
            continue;
        }

        if let Some(normalized) = normalize_http_url(cleaned) {
            if seen.insert(normalized.clone()) {
                out.push(normalized);
            }
        }
    }

    out
}

/// Returns `true` if the string contains multiple candidate URLs.
///
/// This is a convenience for UI logic (e.g. confirm dialog).
pub fn contains_multiple_urls(text: &str) -> bool {
    let urls = extract_urls(text);
    urls.len() > 1
}

/// Normalize a presumed http(s) URL.
///
/// Normalization rules:
/// - Only accepts http/https
/// - Lowercases scheme and host
/// - Removes URL fragments (`#...`) because they are not meaningful for downloads
/// - Removes default ports (80 for http, 443 for https)
/// - Preserves path and query as-is (aside from Url parsing normalization)
pub fn normalize_http_url(input: &str) -> Option<String> {
    let trimmed = input.trim();
    if trimmed.is_empty() {
        return None;
    }

    let mut url = Url::parse(trimmed).ok()?;

    match url.scheme() {
        "http" | "https" => {}
        _ => return None,
    }

    // Strip fragments
    url.set_fragment(None);

    // Lowercase scheme and host. `url` crate normalizes scheme itself, but we make it explicit.
    // Host lowercasing: only apply when host exists & is a domain.
    let scheme = url.scheme().to_ascii_lowercase();
    if scheme != url.scheme() {
        // There's no direct setter for scheme; re-parse with updated scheme.
        // We do a minimal rebuild.
        let rebuilt = rebuild_with_scheme(&url, &scheme)?;
        url = rebuilt;
    }

    if let Some(host) = url.host_str() {
        let lower = host.to_ascii_lowercase();
        if lower != host {
            // Rebuild with updated host; Url API doesn't allow setting host without mutable authority changes.
            let rebuilt = rebuild_with_host(&url, &lower)?;
            url = rebuilt;
        }
    }

    // Remove default ports
    let is_default_port = match (url.scheme(), url.port()) {
        ("http", Some(80)) => true,
        ("https", Some(443)) => true,
        _ => false,
    };
    if is_default_port {
        // Safe to ignore error; it only fails if URL cannot have a port (which it can for http/https).
        let _ = url.set_port(None);
    }

    Some(url.to_string())
}

/// Trim common trailing punctuation which frequently appears in pasted text.
///
/// Example: `https://example.com/foo),` -> `https://example.com/foo`
///
/// We purposely do not trim leading punctuation to avoid harming URLs like `https://`.
fn trim_trailing_punct(s: &str) -> &str {
    // Common delimiters around URLs in prose, markdown, chats, etc.
    // We apply repeatedly to peel off multiple characters.
    let mut end = s.len();

    while end > 0 {
        let ch = s[..end].chars().last().unwrap();
        let should_trim = matches!(
            ch,
            ')'
                | ']'
                | '}'
                | '>' // HTML-ish
                | ','
                | '.'
                | ';'
                | ':'
                | '!'
                | '?'
                | '"' // quotes
                | '\''
        );

        if !should_trim {
            break;
        }

        // Keep "http://example.com/:"? Unlikely; prioritize common cases.
        // Also avoid trimming ':' when it is part of the scheme (won't be at end).
        end -= ch.len_utf8();
    }

    &s[..end]
}

fn rebuild_with_scheme(url: &Url, new_scheme: &str) -> Option<Url> {
    // Construct by string manipulation for minimal churn.
    let mut s = url.to_string();

    // Replace leading "<scheme>:" with "new_scheme:"
    // Since Url::to_string() always starts with scheme, this is stable.
    if let Some(idx) = s.find(':') {
        s.replace_range(..idx, new_scheme);
        Url::parse(&s).ok()
    } else {
        None
    }
}

fn rebuild_with_host(url: &Url, new_host: &str) -> Option<Url> {
    // Rebuild via Url mutators where possible:
    // `set_host` exists and is the most correct approach.
    let mut cloned = url.clone();
    cloned.set_host(Some(new_host)).ok()?;
    Some(cloned)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn extracts_single_url() {
        let urls = extract_urls("hello https://example.com/world");
        assert_eq!(urls, vec!["https://example.com/world".to_string()]);
    }

    #[test]
    fn extracts_multiple_urls_dedup_preserve_order() {
        let urls = extract_urls(
            "a https://example.com/x\nb https://example.com/y c https://example.com/x",
        );
        assert_eq!(
            urls,
            vec![
                "https://example.com/x".to_string(),
                "https://example.com/y".to_string()
            ]
        );
    }

    #[test]
    fn trims_trailing_punct() {
        let urls = extract_urls("see (https://example.com/foo), ok");
        assert_eq!(urls, vec!["https://example.com/foo".to_string()]);
    }

    #[test]
    fn strips_fragment() {
        let urls = extract_urls("https://example.com/watch?v=1#t=10");
        assert_eq!(urls, vec!["https://example.com/watch?v=1".to_string()]);
    }

    #[test]
    fn removes_default_ports() {
        let urls = extract_urls("http://example.com:80/x https://example.com:443/y");
        assert_eq!(
            urls,
            vec![
                "http://example.com/x".to_string(),
                "https://example.com/y".to_string()
            ]
        );
    }

    #[test]
    fn ignores_non_http_schemes() {
        let urls = extract_urls("ftp://example.com/x https://example.com/y");
        assert_eq!(urls, vec!["https://example.com/y".to_string()]);
    }
}
