<div align="center">
  <img src="branding/app-icon.png" width="88" height="88" alt="AntiGravity Switch icon">
  <h1>AntiGravity Switch (Custom Edition)</h1>
  <p>Minimalist, lightweight account switcher for the Antigravity desktop application.</p>
</div>

## About this fork

This repository (`Epikaigle/antigravity-switch`) is a trimmed, customized fork based on **[anglee0323/agy-switch](https://github.com/anglee0323/agy-switch)** (`v4.10.17`), originally derived from **[lbjlaq/Antigravity-Manager](https://github.com/lbjlaq/Antigravity-Manager)**.

In accordance with **CC BY-NC-SA 4.0**, all substantial modifications from upstream are listed below:

- **Focused feature set (stripped down for reliability and speed):**
  - Kept: Google OAuth login & refresh-token/JSON import-export, live quota fetching & refresh, fast account switching, tray/menu-bar quick dashboard, proxy/general settings, and CLI helpers.
  - Removed: Token usage / response performance analytics, API cost & quota USD/CNY valuation, smart auto-switching, built-in updater, and experimental client UI patching (`app_experiments`).
- **Isolated local storage:** Saves accounts and configuration in `~/.antigravity_switch` (does not interfere with Antigravity conversation history in `~/.gemini/antigravity` or upstream `~/.antigravity_tools`).
- **Linux AppImage & desktop integration improvements:**
  - Detects and cleanly terminates/relaunches Antigravity AppImages (`/tmp/.mount_*` FUSE binaries vs `.appimage` wrapper) and excludes `language_server` / subprocess helpers and `antigravity-switch` (including Linux 15-char `comm` truncation `antigravity-swi`).
  - Parses `.desktop` `Exec=` launch entries, scans `~/AppImages`, and preserves `--no-sandbox` when relaunching Linux AppImages.
- **Multilingual UI (`fr`, `en`, `zh`):** Added full French (`fr`) translation alongside English (`en`) and Simplified Chinese (`zh`) for both the main UI and tray/quick dashboard.
- **Rust networking & identity cleanup:** Migrated HTTP client from `rquest` to standard `reqwest` (`rustls-tls`, `socks`) and renamed desktop binary/app identity to `antigravity-switch`.

## Build from source (Linux)

Prerequisites: Node.js 22+, Rust toolchain pinned in [`rust-toolchain.toml`](rust-toolchain.toml) (`1.93.0`), and Tauri v2 Linux system libraries (GTK3, WebKitGTK 4.1, `libayatana-appindicator3`, `libsecret`).

### OAuth configuration

No OAuth client secrets are committed in this repository. Copy [`.env.example`](.env.example) to `.env` before compiling locally (values are embedded into your local binary via `build.rs`), or provide `ANTIGRAVITY_OAUTH_CLIENT_ID` and `ANTIGRAVITY_OAUTH_CLIENT_SECRET` at runtime via environment variables or `~/.antigravity_switch/.env`.

```sh
cp .env.example .env
# Edit .env with your OAuth client ID & secret
npm ci
npm run build
cargo test --manifest-path src-tauri/Cargo.toml --lib --bins
cargo build --manifest-path src-tauri/Cargo.toml --release --bin antigravity-switch
```

The compiled desktop binary is placed at `src-tauri/target/release/antigravity-switch`.

## Attribution & License

- **Upstream project:** [anglee0323/agy-switch](https://github.com/anglee0323/agy-switch) (`v4.10.17`)
- **Original work:** [lbjlaq/Antigravity-Manager](https://github.com/lbjlaq/Antigravity-Manager)
- **License:** Creative Commons Attribution-NonCommercial-ShareAlike 4.0 International ([`LICENSE`](LICENSE))
