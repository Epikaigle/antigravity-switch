use std::path::Path;

/// Parse a `KEY=VALUE` line from a `.env` file, skipping blanks/comments and stripping matching quotes.
pub fn parse_env_line(line: &str) -> Option<(&str, &str)> {
    let trimmed = line.trim();
    if trimmed.is_empty() || trimmed.starts_with('#') {
        return None;
    }
    let stripped = trimmed.strip_prefix("export ").unwrap_or(trimmed).trim();
    let (key, raw_val) = stripped.split_once('=')?;
    let key = key.trim();
    if key.is_empty() {
        return None;
    }
    let mut val = raw_val.trim();
    if val.len() >= 2
        && ((val.starts_with('"') && val.ends_with('"'))
            || (val.starts_with('\'') && val.ends_with('\'')))
    {
        val = &val[1..val.len() - 1];
    }
    let val = val.trim();
    if val.is_empty() {
        return None;
    }
    Some((key, val))
}

/// Read the first non-empty value for `target_key` from a `.env` file if readable.
pub fn read_key_from_file(path: &Path, target_key: &str) -> Option<String> {
    let contents = std::fs::read_to_string(path).ok()?;
    for line in contents.lines() {
        if let Some((key, val)) = parse_env_line(line) {
            if key == target_key {
                return Some(val.to_string());
            }
        }
    }
    None
}
