#[path = "src/utils/dotenv.rs"]
mod dotenv;

fn emit_oauth_build_env() {
    const KEYS: [&str; 2] = [
        "ANTIGRAVITY_OAUTH_CLIENT_ID",
        "ANTIGRAVITY_OAUTH_CLIENT_SECRET",
    ];
    for key in KEYS {
        println!("cargo:rerun-if-env-changed={key}");
    }

    let manifest_dir =
        std::path::PathBuf::from(std::env::var_os("CARGO_MANIFEST_DIR").unwrap_or_default());
    let candidate_files = [manifest_dir.join(".env"), manifest_dir.join("../.env")];
    for file in &candidate_files {
        if file.is_file() {
            println!("cargo:rerun-if-changed={}", file.display());
        }
    }

    for key in KEYS {
        if let Some(val) = std::env::var(key)
            .ok()
            .map(|v| v.trim().to_string())
            .filter(|v| !v.is_empty())
            .or_else(|| {
                candidate_files
                    .iter()
                    .find_map(|path| dotenv::read_key_from_file(path, key))
            })
        {
            println!("cargo:rustc-env={key}={val}");
        }
    }
}

fn main() {
    emit_oauth_build_env();

    // Unit-test executables also import Common Controls v6 through Tauri's menu
    // stack. Own the manifest at the linker boundary for binaries/tests/examples;
    // Tauri continues to supply the icon and VERSION resource, without a second
    // manifest resource. See tauri-apps/tauri#13948 and its official API example.
    if std::env::var("CARGO_CFG_TARGET_OS").as_deref() == Ok("windows")
        && std::env::var("CARGO_CFG_TARGET_ENV").as_deref() == Ok("msvc")
    {
        tauri_build::try_build(tauri_build::Attributes::new().windows_attributes(
            tauri_build::WindowsAttributes::new_without_app_manifest(),
        ))
        .expect("failed to build Tauri resources");
        let manifest = std::path::PathBuf::from(std::env::var_os("CARGO_MANIFEST_DIR").unwrap())
            .join("../scripts/fixtures/windows-desktop.manifest");
        println!("cargo:rerun-if-changed={}", manifest.display());
        println!("cargo:rustc-link-arg=/MANIFEST:EMBED");
        println!("cargo:rustc-link-arg=/MANIFESTINPUT:{}", manifest.display());
    } else {
        tauri_build::build();
    }
}
