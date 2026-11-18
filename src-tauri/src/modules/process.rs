use std::path::Path;
use std::process::Command;
use std::thread;
use std::time::Duration;
use sysinfo::{Process, ProcessRefreshKind, ProcessesToUpdate, System, UpdateKind};

#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;

fn refresh_processes_for_inspection() -> System {
    let mut system = System::new();
    system.refresh_processes_specifics(
        ProcessesToUpdate::All,
        ProcessRefreshKind::new()
            .with_exe(UpdateKind::Always)
            .with_cmd(UpdateKind::Always)
            .with_environ(UpdateKind::Always),
    );
    system
}

fn is_appimage_mount_exe(path_str: &str) -> bool {
    path_str.starts_with("/tmp/.mount_")
}

fn is_appimage_path(path: &Path) -> bool {
    path.extension()
        .and_then(|ext| ext.to_str())
        .is_some_and(|ext| ext.eq_ignore_ascii_case("appimage"))
}

fn format_args_lower(process: &Process) -> String {
    process
        .cmd()
        .iter()
        .map(|arg| arg.to_string_lossy().to_lowercase())
        .collect::<Vec<String>>()
        .join(" ")
}

fn is_helper_process(exe_path_lower: &str, name_lower: &str, args_str_lower: &str) -> bool {
    args_str_lower.contains("--type=")
        || args_str_lower.contains("node-ipc")
        || args_str_lower.contains("nodeipc")
        || args_str_lower.contains("max-old-space-size")
        || args_str_lower.contains("node_modules")
        || name_lower.contains("helper")
        || name_lower.contains("plugin")
        || name_lower.contains("renderer")
        || name_lower.contains("gpu")
        || name_lower.contains("crashpad")
        || name_lower.contains("utility")
        || name_lower.contains("audio")
        || name_lower.contains("sandbox")
        || name_lower.contains("language_server")
        || name_lower.contains("language-server")
        || exe_path_lower.contains("crashpad")
        || exe_path_lower.contains("language_server")
        || exe_path_lower.contains("language-server")
}

#[cfg(target_os = "linux")]
fn resolve_appimage_env_path(process: &Process) -> Option<std::path::PathBuf> {
    for entry in process.environ() {
        let text = entry.to_string_lossy();
        if let Some(raw_path) = text.strip_prefix("APPIMAGE=") {
            let trimmed = raw_path.trim();
            if !trimmed.is_empty() && !is_appimage_mount_exe(trimmed) {
                let candidate = std::path::PathBuf::from(trimmed);
                if candidate.exists() {
                    return Some(candidate);
                }
            }
        }
    }
    None
}

fn process_matches_manual_path(
    process: &Process,
    m_path: &Path,
    exe_path_lower: &str,
    name_lower: &str,
) -> bool {
    if let Some(p_exe) = process.exe() {
        if let Ok(p_path) = p_exe.canonicalize() {
            #[cfg(target_os = "macos")]
            {
                let m_path_str = m_path.to_string_lossy();
                let p_path_str = p_path.to_string_lossy();
                if let (Some(m_idx), Some(p_idx)) =
                    (m_path_str.find(".app"), p_path_str.find(".app"))
                {
                    if m_path_str[..m_idx + 4] == p_path_str[..p_idx + 4] {
                        return true;
                    }
                }
            }

            #[cfg(not(target_os = "macos"))]
            if m_path == p_path.as_path() {
                return true;
            }
        }
    }

    #[cfg(target_os = "linux")]
    {
        if let Some(appimage_path) = resolve_appimage_env_path(process) {
            let resolved = appimage_path.canonicalize().unwrap_or(appimage_path);
            if resolved.as_path() == m_path {
                return true;
            }
        }
        if is_appimage_path(m_path)
            && is_appimage_mount_exe(exe_path_lower)
            && is_app_candidate(exe_path_lower, name_lower)
        {
            return true;
        }
    }

    #[cfg(not(target_os = "linux"))]
    let _ = (exe_path_lower, name_lower);

    false
}

/// Get normalized path of the current running executable
fn get_current_exe_path() -> Option<std::path::PathBuf> {
    std::env::current_exe()
        .ok()
        .and_then(|p| p.canonicalize().ok())
}

/// Helper to extract executable paths of Antigravity IDE instances
/// Uses config path as primary, and falls back to cmd() arg scanning (works on macOS/Linux)
fn get_ide_exe_paths(system: &System) -> std::collections::HashSet<String> {
    let mut immune_exe_paths = std::collections::HashSet::new();

    // Primary: load from explicit config setting (most reliable on Windows)
    if let Ok(config) = crate::modules::config::load_app_config() {
        if let Some(ide_path) = config.antigravity_ide_executable {
            if let Ok(canonical) = std::path::PathBuf::from(&ide_path).canonicalize() {
                immune_exe_paths.insert(canonical.to_string_lossy().to_lowercase());
            } else {
                immune_exe_paths.insert(ide_path.to_lowercase());
            }
        }
    }

    // Fallback: scan process cmd() args (works on macOS/Linux, may be empty on Windows)
    for (_pid, process) in system.processes() {
        let args = process.cmd();
        let args_str = args
            .iter()
            .map(|arg| arg.to_string_lossy().to_lowercase())
            .collect::<Vec<String>>()
            .join(" ");

        if is_ide_name(&args_str) {
            if let Some(exe_path) = process.exe().and_then(|p| p.to_str()) {
                immune_exe_paths.insert(exe_path.to_lowercase());
            }
        }
    }
    immune_exe_paths
}

/// Check if Antigravity is running
pub fn is_antigravity_running(target_ide: Option<&str>) -> bool {
    let system = refresh_processes_for_inspection();
    let ide_exe_paths = get_ide_exe_paths(&system);

    let current_exe = get_current_exe_path();
    let current_pid = std::process::id();

    // Load both manual paths from config
    let config = crate::modules::config::load_app_config().ok();
    let manual_path = config
        .as_ref()
        .and_then(|c| c.antigravity_executable.as_ref())
        .and_then(|p| std::path::PathBuf::from(p).canonicalize().ok());
    let ide_manual_path = config
        .as_ref()
        .and_then(|c| c.antigravity_ide_executable.as_ref())
        .and_then(|p| std::path::PathBuf::from(p).canonicalize().ok());

    for (pid, process) in system.processes() {
        let pid_u32 = pid.as_u32();
        if pid_u32 == current_pid {
            continue;
        }

        let name = process.name().to_string_lossy().to_lowercase();
        let exe_path = process
            .exe()
            .and_then(|p| p.to_str())
            .unwrap_or("")
            .to_lowercase();

        // Never mistake this switcher itself for Antigravity
        if is_switch_process(&exe_path, &name) {
            continue;
        }

        // Exclude own path (handles case where manager is mistaken for Antigravity on Linux)
        if let (Some(ref my_path), Some(p_exe)) = (&current_exe, process.exe()) {
            if let Ok(p_path) = p_exe.canonicalize() {
                if my_path == &p_path {
                    continue;
                }
            }
        }

        // Common helper process exclusion logic
        let args_str = format_args_lower(process);
        if is_helper_process(&exe_path, &name, &args_str) {
            continue;
        }

        // Recognition ref 2: If targeting IDE and ide_manual_path is configured, check it first
        if target_ide == Some("ide") {
            if let (Some(ref ide_m_path), Some(p_exe)) = (&ide_manual_path, process.exe()) {
                if let Ok(p_path) = p_exe.canonicalize() {
                    #[cfg(target_os = "macos")]
                    {
                        let m = ide_m_path.to_string_lossy();
                        let p = p_path.to_string_lossy();
                        if let (Some(mi), Some(pi)) = (m.find(".app"), p.find(".app")) {
                            if m[..mi + 4] == p[..pi + 4] {
                                return true;
                            }
                        }
                    }
                    #[cfg(not(target_os = "macos"))]
                    if ide_m_path == &p_path {
                        return true;
                    }
                }
            }
        }

        // Recognition ref 3: Priority check for manual path match (client)
        if target_ide != Some("ide") {
            if let Some(ref m_path) = manual_path {
                if process_matches_manual_path(process, m_path, &exe_path, &name) {
                    return true;
                }
            }
        }

        // 3. Strict mode: If the relevant manual path is configured, we strictly enforce it
        // and DO NOT fallback to fuzzy string matching.
        if manual_path.is_some() && target_ide != Some("ide") {
            continue;
        }
        if ide_manual_path.is_some() && target_ide == Some("ide") {
            continue;
        }

        // Check if the process matches target_ide
        let is_ide_match = if target_ide == Some("ide") {
            is_ide_name(&exe_path)
                || is_ide_name(&name)
                || ide_exe_paths.contains(&exe_path)
        } else {
            if ide_exe_paths.contains(&exe_path) {
                false // Explicitly immune (it is an IDE)
            } else {
                is_app_candidate(&exe_path, &name)
            }
        };

        if is_ide_match {
            return true;
        }
    }

    false
}

/// Be conservative: any App/IDE, native agy or language server may still write
/// the shared App state, including one outside the detected App process tree.
#[cfg(target_os = "windows")]
pub(crate) fn state_writer_running() -> bool {
    if is_antigravity_running(None) || is_antigravity_running(Some("ide")) {
        return true;
    }
    let mut system = System::new();
    system.refresh_processes(sysinfo::ProcessesToUpdate::All);
    system.processes().values().any(|process| {
        let name = process.name().to_string_lossy();
        name.eq_ignore_ascii_case("agy.exe") || name.eq_ignore_ascii_case("language_server.exe")
    })
}

#[cfg(target_os = "linux")]
/// Get PID set of current process and all ancestors.
/// Only ancestors (parents/grandparents) are excluded to prevent accidentally killing
/// the launcher or shell that started the Manager.
/// Child processes spawned by the Manager (e.g., the IDE) must remain killable, so
/// descendants are intentionally NOT included here.
fn get_self_family_pids(system: &sysinfo::System) -> std::collections::HashSet<u32> {
    let current_pid = std::process::id();
    let mut family_pids = std::collections::HashSet::new();
    family_pids.insert(current_pid);

    // Traverse upward to find all ancestors - prevent killing the launcher/shell
    let mut next_pid = current_pid;
    // Prevent infinite loop, max depth 10
    for _ in 0..10 {
        let pid_val = sysinfo::Pid::from_u32(next_pid);
        if let Some(process) = system.process(pid_val) {
            if let Some(parent) = process.parent() {
                let parent_id = parent.as_u32();
                // Avoid cycles or duplicates
                if !family_pids.insert(parent_id) {
                    break;
                }
                next_pid = parent_id;
            } else {
                break;
            }
        } else {
            break;
        }
    }

    family_pids
}

/// Get PIDs of all Antigravity processes (including main and helper processes)
fn get_antigravity_pids(target_ide: Option<&str>) -> Vec<u32> {
    let system = refresh_processes_for_inspection();
    let ide_exe_paths = get_ide_exe_paths(&system);

    // Linux: Enable family process tree exclusion
    #[cfg(target_os = "linux")]
    let family_pids = get_self_family_pids(&system);

    let mut pids = Vec::new();
    let current_pid = std::process::id();
    let current_exe = get_current_exe_path();

    // Load both manual paths from config
    let config = crate::modules::config::load_app_config().ok();
    let manual_path = config
        .as_ref()
        .and_then(|c| c.antigravity_executable.as_ref())
        .and_then(|p| std::path::PathBuf::from(p).canonicalize().ok());
    let ide_manual_path = config
        .as_ref()
        .and_then(|c| c.antigravity_ide_executable.as_ref())
        .and_then(|p| std::path::PathBuf::from(p).canonicalize().ok());

    for (pid, process) in system.processes() {
        let pid_u32 = pid.as_u32();

        // Exclude own PID
        if pid_u32 == current_pid {
            continue;
        }

        // Exclude own executable path (hardened against broad name matching)
        if let (Some(ref my_path), Some(p_exe)) = (&current_exe, process.exe()) {
            if let Ok(p_path) = p_exe.canonicalize() {
                if my_path == &p_path {
                    continue;
                }
            }
        }

        let name = process.name().to_string_lossy().to_lowercase();
        let exe_path = process
            .exe()
            .and_then(|p| p.to_str())
            .unwrap_or("")
            .to_lowercase();

        if is_switch_process(&exe_path, &name) {
            continue;
        }

        #[cfg(target_os = "linux")]
        {
            // 1. Exclude family processes (self, children, parents)
            if family_pids.contains(&pid_u32) {
                continue;
            }
            // 2. Extra protection: match "tools" likely manager if not a child
            if name.contains("tools") {
                continue;
            }
        }

        #[cfg(not(target_os = "linux"))]
        {
            // Other platforms: exclude only self
            if pid_u32 == current_pid {
                continue;
            }
        }

        // Recognition ref IDE manual path: If the process exactly matches the configured IDE path,
        // NEVER add it to kill list regardless of target_ide
        if let (Some(ref ide_m_path), Some(p_exe)) = (&ide_manual_path, process.exe()) {
            if let Ok(p_path) = p_exe.canonicalize() {
                #[cfg(target_os = "macos")]
                let matches = {
                    let m = ide_m_path.to_string_lossy();
                    let p = p_path.to_string_lossy();
                    matches!(m.find(".app").zip(p.find(".app")), Some((mi, pi)) if m[..mi + 4] == p[..pi + 4])
                };
                #[cfg(not(target_os = "macos"))]
                let matches = ide_m_path == &p_path;

                if matches && target_ide != Some("ide") {
                    // This is explicitly the IDE we must NOT kill when switching client
                    continue;
                }
                if matches && target_ide == Some("ide") {
                    // This is the IDE we WANT to close
                    pids.push(pid_u32);
                    continue;
                }
            }
        }

        // Recognition ref 3: Check manual config path match (client)
        if let Some(ref m_path) = manual_path {
            if !exe_path.contains("language_server")
                && !exe_path.contains("language-server")
                && process_matches_manual_path(process, m_path, &exe_path, &name)
            {
                #[cfg(target_os = "macos")]
                let is_main = {
                    let args_str = format_args_lower(process);
                    !is_helper_process(&exe_path, &name, &args_str)
                };
                #[cfg(not(target_os = "macos"))]
                let is_main = true;

                if is_main {
                    if target_ide == Some("ide") {
                        // This is explicitly the client we must NOT kill when switching IDE
                        continue;
                    } else {
                        // This is the client we WANT to close
                        pids.push(pid_u32);
                        continue;
                    }
                }
            }
        }

        // 4. Strict mode: If the relevant manual path is configured, we strictly enforce it
        // and DO NOT fallback to fuzzy string matching.
        if manual_path.is_some() && target_ide != Some("ide") {
            continue;
        }
        if ide_manual_path.is_some() && target_ide == Some("ide") {
            continue;
        }

        // Common helper process exclusion logic
        let args_str = format_args_lower(process);
        let is_helper = is_helper_process(&exe_path, &name, &args_str);

        // Check if the process matches target_ide
        let is_ide_match = if target_ide == Some("ide") {
            is_ide_name(&exe_path)
                || is_ide_name(&name)
                || ide_exe_paths.contains(&exe_path)
        } else {
            if ide_exe_paths.contains(&exe_path) {
                false // Explicitly immune (it is an IDE)
            } else {
                is_app_candidate(&exe_path, &name)
            }
        };

        if is_ide_match && !is_helper {
            pids.push(pid_u32);
        }
    }

    if !pids.is_empty() {
        crate::modules::logger::log_info(&format!(
            "Found {} Antigravity ({:?}) processes: {:?}",
            pids.len(),
            target_ide,
            pids
        ));
    }

    pids
}

#[cfg(any(target_os = "windows", test))]
fn wait_until_stopped(deadline: std::time::Instant, mut running: impl FnMut() -> bool) -> bool {
    loop {
        if !running() { return true; }
        let Some(remaining) = deadline.checked_duration_since(std::time::Instant::now()) else { return false; };
        thread::sleep(remaining.min(Duration::from_millis(200)));
    }
}

#[cfg(target_os = "windows")]
mod windows_close;

/// Close Antigravity processes
pub fn close_antigravity(timeout_secs: u64, target_ide: Option<&str>) -> Result<(), String> {
    crate::modules::logger::log_info(&format!("Closing Antigravity ({:?})...", target_ide));

    #[cfg(target_os = "windows")]
    {
        // Ask identified windows to close normally first so the client can flush its
        // state, mirroring SIGTERM on macOS/Linux. A client kept alive in the background
        // or tray, or one with no visible window, is force-closed after the grace period.
        let pids = get_antigravity_pids(target_ide);
        if !pids.is_empty() {
            let started = std::time::Instant::now();
            let deadline = started + Duration::from_millis(timeout_secs.saturating_mul(700));
            let hard_deadline = started + Duration::from_millis(timeout_secs.saturating_mul(1000));
            if let Err(error) = windows_close::request_windows_close(&pids) {
                crate::modules::logger::log_warn(&error);
            }
            if !wait_until_stopped(deadline, || is_antigravity_running(target_ide)) {
                let remaining = get_antigravity_pids(target_ide);
                crate::modules::logger::log_warn(&format!(
                    "Antigravity did not close normally; force-closing {} remaining processes on Windows...",
                    remaining.len()
                ));
                for pid in remaining {
                    let _ = Command::new("taskkill")
                        .args(["/F", "/PID", &pid.to_string()])
                        .creation_flags(0x08000000) // CREATE_NO_WINDOW
                        .output();
                }
                wait_until_stopped(hard_deadline, || is_antigravity_running(target_ide));
            }
        }
    }

    #[cfg(target_os = "macos")]
    {
        // macOS: Optimize closing strategy to avoid "Window terminated unexpectedly" popups
        // Strategy: SEND SIGTERM to main process only, let it coordinate closing children

        let pids = get_antigravity_pids(target_ide);
        if !pids.is_empty() {
            // 1. Identify main process (PID)
            let mut system = System::new();
            system.refresh_processes(sysinfo::ProcessesToUpdate::All);

            let mut main_pid = None;

            // Load manual configuration path as highest priority reference
            let manual_path = crate::modules::config::load_app_config()
                .ok()
                .and_then(|c| c.antigravity_executable)
                .and_then(|p| std::path::PathBuf::from(p).canonicalize().ok());

            crate::modules::logger::log_info("Analyzing process list to identify main process:");
            for pid_u32 in &pids {
                let pid = sysinfo::Pid::from_u32(*pid_u32);
                if let Some(process) = system.process(pid) {
                    let name = process.name().to_string_lossy();
                    let args = process.cmd();
                    let args_str = args
                        .iter()
                        .map(|arg| arg.to_string_lossy().into_owned())
                        .collect::<Vec<String>>()
                        .join(" ");

                    crate::modules::logger::log_info(&format!(
                        " - PID: {} | Name: {}", pid_u32, name
                    ));

                    // 1. Priority to manual path matching
                    if let (Some(ref m_path), Some(p_exe)) = (&manual_path, process.exe()) {
                        if let Ok(p_path) = p_exe.canonicalize() {
                            let m_path_str = m_path.to_string_lossy();
                            let p_path_str = p_path.to_string_lossy();
                            if let (Some(m_idx), Some(p_idx)) =
                                (m_path_str.find(".app"), p_path_str.find(".app"))
                            {
                                if m_path_str[..m_idx + 4] == p_path_str[..p_idx + 4] {
                                    // Deep validation: even if path matches, must exclude Helper keywords and arguments
                                    let is_helper_by_args = args_str.contains("--type=");
                                    let is_helper_by_name = name.to_lowercase().contains("helper")
                                        || name.to_lowercase().contains("plugin")
                                        || name.to_lowercase().contains("renderer")
                                        || name.to_lowercase().contains("gpu")
                                        || name.to_lowercase().contains("crashpad")
                                        || name.to_lowercase().contains("utility")
                                        || name.to_lowercase().contains("audio")
                                        || name.to_lowercase().contains("sandbox")
                                        || name.to_lowercase().contains("language_server");

                                    if !is_helper_by_args && !is_helper_by_name {
                                        main_pid = Some(pid_u32);
                                        crate::modules::logger::log_info(&format!(
                                            "   => Identified as main process (manual path match)"
                                        ));
                                        break;
                                    }
                                }
                            }
                        }
                    }

                    // 2. Feature analysis matching (fallback)
                    let is_helper_by_name = name.to_lowercase().contains("helper")
                        || name.to_lowercase().contains("crashpad")
                        || name.to_lowercase().contains("utility")
                        || name.to_lowercase().contains("audio")
                        || name.to_lowercase().contains("sandbox")
                        || name.to_lowercase().contains("language_server")
                        || name.to_lowercase().contains("plugin")
                        || name.to_lowercase().contains("renderer");

                    let is_helper_by_args = args_str.contains("--type=");

                    if !is_helper_by_name && !is_helper_by_args {
                        if main_pid.is_none() {
                            main_pid = Some(pid_u32);
                            crate::modules::logger::log_info(&format!(
                                "   => Identified as main process (Name/Args analysis)"
                            ));
                        }
                    } else {
                        crate::modules::logger::log_info(&format!(
                            "   => Identified as helper process (Helper/Args)"
                        ));
                    }
                }
            }

            // Phase 1: Graceful exit (SIGTERM)
            if let Some(pid) = main_pid {
                crate::modules::logger::log_info(&format!(
                    "Sending SIGTERM to main process PID: {}",
                    pid
                ));
                let _ = Command::new("kill")
                    .args(["-15", &pid.to_string()])
                    .output();
            } else {
                crate::modules::logger::log_warn(
                    "No main process identified, sending SIGTERM to all associated processes",
                );
                for pid in &pids {
                    let _ = Command::new("kill")
                        .args(["-15", &pid.to_string()])
                        .output();
                }
            }

            // Wait for graceful exit (max 70% of timeout_secs)
            let graceful_timeout = (timeout_secs * 7) / 10;
            let start = std::time::Instant::now();
            while start.elapsed() < Duration::from_secs(graceful_timeout) {
                if !is_antigravity_running(target_ide) {
                    crate::modules::logger::log_info("All Antigravity processes gracefully closed");
                    return Ok(());
                }
                thread::sleep(Duration::from_millis(500));
            }

            // Phase 2: Force kill (SIGKILL) - targeting all remaining processes (Helpers)
            if is_antigravity_running(target_ide) {
                let remaining_pids = get_antigravity_pids(target_ide);
                if !remaining_pids.is_empty() {
                    crate::modules::logger::log_warn(&format!(
                        "Graceful exit timeout, force killing {} remaining processes (SIGKILL)",
                        remaining_pids.len()
                    ));
                    for pid in &remaining_pids {
                        let output = Command::new("kill").args(["-9", &pid.to_string()]).output();

                        if let Ok(result) = output {
                            if !result.status.success() {
                                let error = String::from_utf8_lossy(&result.stderr);
                                if !error.contains("No such process") {
                                    // "No matching processes" for killall, "No such process" for kill
                                    crate::modules::logger::log_error(&format!(
                                        "SIGKILL process {} failed: {}",
                                        pid, error
                                    ));
                                }
                            }
                        }
                    }
                    thread::sleep(Duration::from_secs(1));
                }

                // Final check
                if !is_antigravity_running(target_ide) {
                    crate::modules::logger::log_info("All processes exited after forced cleanup");
                    return Ok(());
                }
            } else {
                crate::modules::logger::log_info("All processes exited after SIGTERM");
                return Ok(());
            }
        } else {
            // Only consider not running when pids is empty, don't error here as it might already be closed
            crate::modules::logger::log_info("Antigravity not running, no need to close");
            return Ok(());
        }
    }

    #[cfg(target_os = "linux")]
    {
        // Linux: precise closing
        let pids = get_antigravity_pids(target_ide);
        if !pids.is_empty() {
            let system = refresh_processes_for_inspection();

            let mut main_pid = None;
            let mut appimage_fuse_pid = None;

            for pid_u32 in &pids {
                let pid = sysinfo::Pid::from_u32(*pid_u32);
                if let Some(process) = system.process(pid) {
                    let name = process.name().to_string_lossy().to_lowercase();
                    let exe_path = process
                        .exe()
                        .and_then(|p| p.to_str())
                        .unwrap_or("")
                        .to_lowercase();
                    let args_str = format_args_lower(process);

                    if !is_helper_process(&exe_path, &name, &args_str) {
                        // Prefer signaling the main Electron binary before an outer .appimage FUSE wrapper,
                        // so Electron exits cleanly and tears down the FUSE mount naturally.
                        if process.exe().is_some_and(is_appimage_path) {
                            if appimage_fuse_pid.is_none() {
                                appimage_fuse_pid = Some(pid_u32);
                            }
                        } else {
                            main_pid = Some(pid_u32);
                            break;
                        }
                    }
                }
            }
            let main_pid = main_pid.or(appimage_fuse_pid);

            // Phase 1: SIGTERM
            if let Some(pid) = main_pid {
                let _ = Command::new("kill")
                    .args(["-15", &pid.to_string()])
                    .output();
            } else {
                crate::modules::logger::log_warn(
                    "No clear Linux main process identified, sending SIGTERM to all associated processes",
                );
                for pid in &pids {
                    let _ = Command::new("kill")
                        .args(["-15", &pid.to_string()])
                        .output();
                }
            }

            // Wait for graceful exit
            let graceful_timeout = (timeout_secs * 7) / 10;
            let start = std::time::Instant::now();
            while start.elapsed() < Duration::from_secs(graceful_timeout) {
                if !is_antigravity_running(target_ide) {
                    crate::modules::logger::log_info("Antigravity gracefully closed");
                    return Ok(());
                }
                thread::sleep(Duration::from_millis(500));
            }

            // Phase 2: SIGKILL
            if is_antigravity_running(target_ide) {
                let remaining_pids = get_antigravity_pids(target_ide);
                if !remaining_pids.is_empty() {
                    crate::modules::logger::log_warn(&format!(
                        "Graceful exit timeout, force killing {} remaining processes (SIGKILL)",
                        remaining_pids.len()
                    ));
                    for pid in &remaining_pids {
                        let _ = Command::new("kill").args(["-9", &pid.to_string()]).output();
                    }
                    thread::sleep(Duration::from_secs(1));
                }
            }
        } else {
            crate::modules::logger::log_info(
                "No Antigravity processes found to close (possibly filtered or not running)",
            );
        }
    }

    // Final check
    if is_antigravity_running(target_ide) {
        return Err(
            "Unable to close Antigravity process, please close manually and retry".to_string(),
        );
    }

    crate::modules::logger::log_info("Antigravity closed successfully");
    Ok(())
}

/// Clean AppImage-specific environment variables before spawning external processes on Linux
#[cfg(target_os = "linux")]
pub fn clean_appimage_env(cmd: &mut Command) {
    let appimage_vars = [
        "APPIMAGE",
        "APPDIR",
        "ARGV0",
        "OWD",
        "LD_LIBRARY_PATH",
        "LD_PRELOAD",
        "GTK_PATH",
        "GIO_EXTRA_MODULES",
        "GI_TYPELIB_PATH",
        "QT_PLUGIN_PATH",
        "QT_QPA_PLATFORM_PLUGIN_PATH",
    ];
    for var in &appimage_vars {
        cmd.env_remove(var);
    }

    if let Ok(xdg_data_dirs) = std::env::var("XDG_DATA_DIRS") {
        let filtered_dirs: Vec<&str> = xdg_data_dirs
            .split(':')
            .filter(|dir| !dir.starts_with("/tmp/.mount_"))
            .collect();
        cmd.env("XDG_DATA_DIRS", filtered_dirs.join(":"));
    }
}

/// Start Antigravity using the GUI's existing stdio behavior.
pub fn start_antigravity(target_ide: Option<&str>) -> Result<(), String> {
    start_antigravity_with_stdio(target_ide, false)
}

/// CLI launches must not leak child output or keep the CLI's capture pipes open.
pub fn start_antigravity_detached(target_ide: Option<&str>) -> Result<(), String> {
    start_antigravity_with_stdio(target_ide, true)
}

fn prepare_launch_stdio(command: &mut Command, detached: bool) -> Result<(), String> {
    if detached {
        command
            .stdin(std::process::Stdio::null())
            .stdout(std::process::Stdio::null())
            .stderr(std::process::Stdio::null());
        #[cfg(windows)]
        prevent_cli_pipe_inheritance()?;
    }
    Ok(())
}

#[cfg(windows)]
fn prevent_cli_pipe_inheritance() -> Result<(), String> {
    use std::ffi::c_void;
    #[link(name = "Kernel32")]
    extern "system" {
        fn GetStdHandle(kind: u32) -> *mut c_void;
        fn GetFileType(handle: *mut c_void) -> u32;
        fn SetHandleInformation(handle: *mut c_void, mask: u32, flags: u32) -> i32;
    }
    // Stable Rust's Command inherits other inheritable process handles even
    // when its own stdio is NUL. A Node/PowerShell capture pipe can therefore
    // stay open in the APP. Clear only this CLI process's pipe inheritance;
    // the handles remain open/usable by the CLI and GUI launches never run this.
    // Console handles are deliberately untouched (SetHandleInformation is not
    // supported for all console handle types).
    for kind in [-10_i32, -11_i32, -12_i32] {
        unsafe {
            let handle = GetStdHandle(kind as u32);
            if !handle.is_null() && handle as isize != -1 && GetFileType(handle) == 3 {
                if SetHandleInformation(handle, 1, 0) == 0 {
                    return Err(format!(
                        "Cannot isolate CLI capture pipe: {}",
                        std::io::Error::last_os_error()
                    ));
                }
            }
        }
    }
    Ok(())
}

#[cfg(target_os = "linux")]
fn split_desktop_exec_tokens(exec_line: &str) -> Vec<String> {
    let mut tokens = Vec::new();
    let mut current = String::new();
    let mut quote: Option<char> = None;
    let mut chars = exec_line.chars().peekable();
    let mut in_token = false;

    while let Some(ch) = chars.next() {
        match quote {
            Some(q) => {
                if ch == q {
                    quote = None;
                } else if ch == '\\' && q == '"' {
                    if let Some(escaped) = chars.next() {
                        current.push(escaped);
                    }
                } else {
                    current.push(ch);
                }
            }
            None => {
                if ch == '\'' || ch == '"' {
                    quote = Some(ch);
                    in_token = true;
                } else if ch == '\\' {
                    if let Some(escaped) = chars.next() {
                        current.push(escaped);
                        in_token = true;
                    }
                } else if ch.is_whitespace() {
                    if in_token {
                        tokens.push(std::mem::take(&mut current));
                        in_token = false;
                    }
                } else {
                    current.push(ch);
                    in_token = true;
                }
            }
        }
    }
    if in_token {
        tokens.push(current);
    }
    tokens
}

#[cfg(any(target_os = "linux", test))]
fn is_desktop_field_code(token: &str) -> bool {
    matches!(
        token,
        "%f" | "%F" | "%u" | "%U" | "%d" | "%D" | "%n" | "%N" | "%i" | "%c" | "%k" | "%v" | "%m"
    )
}

#[cfg(target_os = "linux")]
fn parse_desktop_exec_line(exec_line: &str) -> Option<(std::path::PathBuf, Vec<String>)> {
    let tokens = split_desktop_exec_tokens(exec_line.trim());
    let mut idx = 0;
    if tokens.get(idx).is_some_and(|t| t == "env" || t == "/usr/bin/env") {
        idx += 1;
        while let Some(tok) = tokens.get(idx) {
            if tok == "-u" || tok == "--unset" {
                idx += 2;
            } else if tok.starts_with('-') || tok.contains('=') {
                idx += 1;
            } else {
                break;
            }
        }
    }
    let exe = tokens.get(idx)?.trim();
    if exe.is_empty() {
        return None;
    }
    let lower_exe = exe.to_lowercase();
    let name = lower_exe.rsplit('/').next().unwrap_or(&lower_exe);
    if is_switch_process(&lower_exe, name) || is_ide_name(&lower_exe) {
        return None;
    }
    let args = tokens[idx + 1..]
        .iter()
        .filter(|tok| !tok.is_empty() && !is_desktop_field_code(tok))
        .cloned()
        .collect();
    Some((std::path::PathBuf::from(exe), args))
}

#[cfg(target_os = "linux")]
fn discover_linux_desktop_entry() -> Option<(std::path::PathBuf, Vec<String>)> {
    let mut search_dirs = Vec::new();
    if let Some(home) = dirs::home_dir() {
        search_dirs.push(home.join(".local/share/applications"));
    }
    search_dirs.push(std::path::PathBuf::from("/usr/local/share/applications"));
    search_dirs.push(std::path::PathBuf::from("/usr/share/applications"));

    for dir in search_dirs {
        let Ok(entries) = std::fs::read_dir(&dir) else {
            continue;
        };
        let mut candidates: Vec<_> = entries
            .flatten()
            .map(|e| e.path())
            .filter(|p| {
                let file_name = p
                    .file_name()
                    .and_then(|n| n.to_str())
                    .unwrap_or("")
                    .to_lowercase();
                file_name.ends_with(".desktop")
                    && file_name.contains("antigravity")
                    && !file_name.contains("switch")
                    && !file_name.contains("ide")
            })
            .collect();
        candidates.sort();

        for path in candidates {
            let Ok(content) = std::fs::read_to_string(&path) else {
                continue;
            };
            let mut in_desktop_entry = false;
            for line in content.lines() {
                let trimmed = line.trim();
                if trimmed.starts_with('[') {
                    in_desktop_entry = trimmed == "[Desktop Entry]";
                    continue;
                }
                if !in_desktop_entry {
                    continue;
                }
                if let Some(exec_val) = trimmed.strip_prefix("Exec=") {
                    if let Some((exe_path, args)) = parse_desktop_exec_line(exec_val) {
                        if let Some(resolved) = resolve_linux_desktop_target(&exe_path) {
                            return Some((resolved, args));
                        }
                    }
                }
            }
        }
    }
    None
}

#[cfg(target_os = "linux")]
fn resolve_linux_desktop_target(exe_path: &Path) -> Option<std::path::PathBuf> {
    if exe_path.is_absolute() {
        if exe_path.exists() && !is_appimage_mount_exe(&exe_path.to_string_lossy()) {
            return Some(exe_path.to_path_buf());
        }
        return None;
    }
    exe_path
        .to_str()
        .and_then(crate::modules::linux_paths::find_executable)
}

fn effective_launch_args(
    launch_path: &Path,
    configured_args: Option<Vec<String>>,
    target_ide: Option<&str>,
) -> Option<Vec<String>> {
    #[cfg(not(target_os = "linux"))]
    {
        let _ = (launch_path, target_ide);
        configured_args
    }

    #[cfg(target_os = "linux")]
    {
        let mut args = match configured_args {
            Some(list) => list,
            None if target_ide != Some("ide") => {
                let mut desktop_args = Vec::new();
                if let Some((desktop_exe, parsed_args)) = discover_linux_desktop_entry() {
                    let same_exe = desktop_exe.canonicalize().ok() == launch_path.canonicalize().ok()
                        || desktop_exe == launch_path;
                    if same_exe {
                        desktop_args = parsed_args;
                    }
                }
                desktop_args
            }
            None => Vec::new(),
        };

        // Ubuntu 24.04 / Linux Mint 22+ restricts unprivileged user namespaces, so Electron
        // inside an AppImage needs --no-sandbox unless already supplied by the user/.desktop.
        if is_appimage_path(launch_path) && !args.iter().any(|arg| arg == "--no-sandbox") {
            args.push("--no-sandbox".to_string());
        }

        if args.is_empty() {
            None
        } else {
            Some(args)
        }
    }
}

#[allow(unused_mut)]
fn start_antigravity_with_stdio(target_ide: Option<&str>, detached: bool) -> Result<(), String> {
    crate::modules::logger::log_info(&format!("Starting Antigravity ({:?})...", target_ide));

    // Prefer manually specified path and args from configuration
    let config = crate::modules::config::load_app_config().ok();
    let manual_path = if target_ide == Some("ide") {
        config
            .as_ref()
            .and_then(|c| c.antigravity_ide_executable.clone())
    } else {
        config
            .as_ref()
            .and_then(|c| c.antigravity_executable.clone())
    };
    let configured_args = config.and_then(|c| {
        if target_ide == Some("ide") {
            c.antigravity_ide_args
        } else {
            c.antigravity_args
        }
    });

    if let Some(mut path_str) = manual_path {
        let mut path = std::path::PathBuf::from(&path_str);

        #[cfg(target_os = "macos")]
        {
            // Fault tolerance: If path is inside .app bundle (e.g. misselected Helper), auto-correct to .app directory
            if let Some(app_idx) = path_str.find(".app") {
                let corrected_app = &path_str[..app_idx + 4];
                if corrected_app != path_str {
                    crate::modules::logger::log_info(&format!(
                        "Detected macOS path inside .app bundle, auto-correcting to: {}",
                        corrected_app
                    ));
                    path_str = corrected_app.to_string();
                    path = std::path::PathBuf::from(&path_str);
                }
            }
        }

        if !is_appimage_mount_exe(&path_str) && path.exists() {
            let args = effective_launch_args(&path, configured_args.clone(), target_ide);
            crate::modules::logger::log_info(&format!(
                "Starting with manual configuration path: {}",
                path_str
            ));

            #[cfg(target_os = "macos")]
            {
                // macOS: if .app directory, use open
                if path_str.ends_with(".app") || path.is_dir() {
                    let mut cmd = Command::new("open");
                    prepare_launch_stdio(&mut cmd, detached)?;
                    cmd.arg("-a").arg(&path_str);

                    // Add startup arguments
                    if let Some(ref args) = args {
                        cmd.arg("--args");
                        for arg in args {
                            cmd.arg(arg);
                        }
                    }

                    cmd.spawn()
                        .map_err(|e| format!("Startup failed (open): {}", e))?;
                } else {
                    let mut cmd = Command::new(&path_str);
                    prepare_launch_stdio(&mut cmd, detached)?;

                    // Add startup arguments
                    if let Some(ref args) = args {
                        for arg in args {
                            cmd.arg(arg);
                        }
                    }

                    cmd.spawn()
                        .map_err(|e| format!("Startup failed (direct): {}", e))?;
                }
            }

            #[cfg(not(target_os = "macos"))]
            {
                let mut cmd = Command::new(&path_str);
                prepare_launch_stdio(&mut cmd, detached)?;

                // Add startup arguments
                if let Some(ref args) = args {
                    for arg in args {
                        cmd.arg(arg);
                    }
                }

                #[cfg(target_os = "linux")]
                clean_appimage_env(&mut cmd);

                #[cfg(target_os = "windows")]
                cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW

                cmd.spawn().map_err(|e| format!("Startup failed: {}", e))?;
            }

            crate::modules::logger::log_info(&format!(
                "Antigravity startup command sent (manual path: {}, args: {:?})",
                path_str, args
            ));
            return Ok(());
        } else {
            crate::modules::logger::log_warn(&format!(
                "Manual configuration path is missing or temporary: {}, falling back to auto-detection",
                path_str
            ));
        }
    }

    #[cfg(target_os = "macos")]
    {
        // Improvement: Use output() to wait for open command completion and capture "app not found" error
        let mut cmd = Command::new("open");
        prepare_launch_stdio(&mut cmd, detached)?;
        let app_name = if target_ide == Some("ide") {
            "Antigravity IDE"
        } else {
            "Antigravity"
        };
        cmd.args(["-a", app_name]);

        // Add startup arguments
        if let Some(ref args) = configured_args {
            cmd.arg("--args");
            for arg in args {
                cmd.arg(arg);
            }
        }

        let output = cmd
            .output()
            .map_err(|e| format!("Execute open command failed: {}", e))?;
        if !output.status.success() {
            let err_msg = String::from_utf8_lossy(&output.stderr);
            return Err(format!("Startup failed: {}", err_msg.trim()));
        }

        crate::modules::logger::log_info("Antigravity startup command sent (macOS open)");
        return Ok(());
    }

    #[cfg(not(target_os = "macos"))]
    {
        // Windows/Linux Auto-detection and Startup
        if let Some(detected_path) = get_antigravity_executable_path(target_ide) {
            let args = effective_launch_args(&detected_path, configured_args, target_ide);
            let mut cmd = Command::new(&detected_path);
            prepare_launch_stdio(&mut cmd, detached)?;

            // Add startup arguments
            if let Some(ref args) = args {
                for arg in args {
                    cmd.arg(arg);
                }
            }

            #[cfg(target_os = "linux")]
            clean_appimage_env(&mut cmd);

            #[cfg(target_os = "windows")]
            cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW

            cmd.spawn().map_err(|e| {
                format!("Startup failed (detected path {:?}): {}", detected_path, e)
            })?;

            crate::modules::logger::log_info(&format!(
                "Antigravity startup command sent (detected path: {:?}, args: {:?})",
                detected_path, args
            ));
            Ok(())
        } else {
            Err("Unable to start Antigravity: executable not found".to_string())
        }
    }
}

fn get_process_info(target_ide: Option<&str>) -> (Option<std::path::PathBuf>, Option<Vec<String>>) {
    let system = refresh_processes_for_inspection();

    let current_exe = get_current_exe_path();
    let current_pid = std::process::id();
    let mut appimage_fuse_fallback: Option<(Option<std::path::PathBuf>, Option<Vec<String>>)> = None;

    for (pid, process) in system.processes() {
        let pid_u32 = pid.as_u32();
        if pid_u32 == current_pid {
            continue;
        }

        // Exclude manager process itself
        if let (Some(ref my_path), Some(p_exe)) = (&current_exe, process.exe()) {
            if let Ok(p_path) = p_exe.canonicalize() {
                if my_path == &p_path {
                    continue;
                }
            }
        }

        let name = process.name().to_string_lossy().to_lowercase();

        // Get executable path and command line arguments
        if let Some(exe) = process.exe() {
            let mut args = process.cmd().iter();
            let _ = args.next();
            let exe_path = exe.to_string_lossy().to_lowercase();

            if is_switch_process(&exe_path, &name) {
                continue;
            }

            // Extract actual arguments from command line (skipping exe path)
            let args = args
                .map(|arg| arg.to_string_lossy().into_owned())
                .collect::<Vec<String>>();

            let args_str = args.join(" ").to_lowercase();

            // Common helper process exclusion logic
            let is_helper = is_helper_process(&exe_path, &name, &args_str);

            let path = Some(exe.to_path_buf());
            let args = Some(args);

            // Is the process a match for target_ide?
            let is_ide_match = if target_ide == Some("ide") {
                is_ide_name(&exe_path) || is_ide_name(&name)
            } else {
                is_app_candidate(&exe_path, &name)
            };

            if is_ide_match && !is_helper {
                #[cfg(target_os = "macos")]
                {
                    if !exe_path.contains("frameworks") {
                        if let Some(bundle) = exe.ancestors().find(|path| path.extension().is_some_and(|extension| extension.eq_ignore_ascii_case("app"))) {
                            return (Some(bundle.to_path_buf()), args);
                        }
                    }
                    return (path, args);
                }

                #[cfg(target_os = "windows")]
                {
                    return (path, args);
                }

                #[cfg(target_os = "linux")]
                {
                    if let Some(real_appimage) = resolve_appimage_env_path(process) {
                        return (Some(real_appimage), args);
                    }
                    if is_appimage_mount_exe(&exe_path) {
                        if appimage_fuse_fallback.is_none() {
                            appimage_fuse_fallback = Some((None, args));
                        }
                        continue;
                    }
                    if is_appimage_path(exe) {
                        appimage_fuse_fallback = Some((path, args));
                        continue;
                    }
                    return (path, args);
                }
            }
        }
    }
    appimage_fuse_fallback.unwrap_or((None, None))
}

/// Get Antigravity executable path from running processes
///
/// Most reliable method to find installation anywhere
pub fn get_path_from_running_process(target_ide: Option<&str>) -> Option<std::path::PathBuf> {
    let (path, _) = get_process_info(target_ide);
    path
}

/// Get Antigravity startup arguments from running processes
pub fn get_args_from_running_process(target_ide: Option<&str>) -> Option<Vec<String>> {
    let (_, args) = get_process_info(target_ide);
    args
}

/// Get --user-data-dir argument value (if exists)
pub fn get_user_data_dir_from_process(target_ide: Option<&str>) -> Option<std::path::PathBuf> {
    // Prefer getting startup arguments from config
    if let Ok(config) = crate::modules::config::load_app_config() {
        let args = if target_ide == Some("ide") { config.antigravity_ide_args } else { config.antigravity_args };
        if let Some(args) = args {
            // Check arguments in config
            for i in 0..args.len() {
                if args[i] == "--user-data-dir" && i + 1 < args.len() {
                    // Next argument is the path
                    let path = std::path::PathBuf::from(&args[i + 1]);
                    if path.exists() {
                        return Some(path);
                    }
                } else if args[i].starts_with("--user-data-dir=") {
                    // Argument and value in same string, e.g. --user-data-dir=/path/to/data
                    let parts: Vec<&str> = args[i].splitn(2, '=').collect();
                    if parts.len() == 2 {
                        let path_str = parts[1];
                        let path = std::path::PathBuf::from(path_str);
                        if path.exists() {
                            return Some(path);
                        }
                    }
                }
            }
        }
    }

    // If not in config, get arguments from running process
    if let Some(args) = get_args_from_running_process(target_ide) {
        for i in 0..args.len() {
            if args[i] == "--user-data-dir" && i + 1 < args.len() {
                // Next argument is the path
                let path = std::path::PathBuf::from(&args[i + 1]);
                if path.exists() {
                    return Some(path);
                }
            } else if args[i].starts_with("--user-data-dir=") {
                // Argument and value in same string, e.g. --user-data-dir=/path/to/data
                let parts: Vec<&str> = args[i].splitn(2, '=').collect();
                if parts.len() == 2 {
                    let path_str = parts[1];
                    let path = std::path::PathBuf::from(path_str);
                    if path.exists() {
                        return Some(path);
                    }
                }
            }
        }
    }

    None
}

/// Get Antigravity executable path (cross-platform)
///
/// Search strategy (highest to lowest priority):
/// 1. Valid user-configured non-temporary path
/// 2. Path resolved from running process (resolving Linux APPIMAGE env)
/// 3. Standard installation locations (.desktop entries, ~/AppImages, system paths)
pub fn get_antigravity_executable_path(target_ide: Option<&str>) -> Option<std::path::PathBuf> {
    // Strategy 1: Check config paths (supports user-configured locations)
    if let Ok(config) = crate::modules::config::load_app_config() {
        let configured = match target_ide {
            Some("ide") => config.antigravity_ide_executable.as_ref(),
            _ => config.antigravity_executable.as_ref(),
        };
        if let Some(p) = configured {
            if !is_appimage_mount_exe(p) {
                let path = std::path::PathBuf::from(p);
                if path.exists() {
                    return Some(path);
                }
            }
        }
    }

    // Strategy 2: Get from running process (supports any location, resolves AppImage)
    if let Some(path) = get_path_from_running_process(target_ide) {
        if !is_appimage_mount_exe(&path.to_string_lossy()) && path.exists() {
            return Some(path);
        }
    }

    // Strategy 3: Check standard installation locations
    check_standard_locations(target_ide)
}

/// Check standard installation locations
fn check_standard_locations(target_ide: Option<&str>) -> Option<std::path::PathBuf> {
    let folder_names: &[&str] = if target_ide == Some("ide") {
        crate::modules::db::data_folder_names(Some("ide"))
    } else if target_ide == Some("code") || target_ide == Some("cursor") {
        &["Antigravity"]
    } else {
        &["Antigravity"]
    };

    #[cfg(target_os = "macos")]
    {
        for folder_name in folder_names {
            let path = std::path::PathBuf::from(format!("/Applications/{}.app", folder_name));
            if path.exists() {
                return Some(path);
            }
        }
    }

    #[cfg(target_os = "windows")]
    {
        use std::env;

        // Get environment variables
        let local_appdata = env::var("LOCALAPPDATA").ok();
        let program_files =
            env::var("ProgramFiles").unwrap_or_else(|_| "C:\\Program Files".to_string());
        let program_files_x86 =
            env::var("ProgramFiles(x86)").unwrap_or_else(|_| "C:\\Program Files (x86)".to_string());

        for folder_name in folder_names {
            let mut possible_paths = Vec::new();

            // User installation location (preferred)
            if let Some(local) = &local_appdata {
                possible_paths.push(
                    std::path::PathBuf::from(local)
                        .join("Programs")
                        .join(folder_name)
                        .join(format!("{}.exe", folder_name)),
                );
            }

            // System installation location
            possible_paths.push(
                std::path::PathBuf::from(&program_files)
                    .join(folder_name)
                    .join(format!("{}.exe", folder_name)),
            );

            // 32-bit compatibility location
            possible_paths.push(
                std::path::PathBuf::from(&program_files_x86)
                    .join(folder_name)
                    .join(format!("{}.exe", folder_name)),
            );

            // Return the first existing path
            for path in possible_paths {
                if path.exists() {
                    return Some(path);
                }
            }
        }
    }

    #[cfg(target_os = "linux")]
    {
        if target_ide != Some("ide") {
            if let Some((desktop_exe, _)) = discover_linux_desktop_entry() {
                return Some(desktop_exe);
            }
        }

        for folder_name in folder_names {
            let exe_name = if target_ide == Some("ide") {
                "antigravity-ide"
            } else {
                "antigravity"
            };

            if let Some(path) = crate::modules::linux_paths::find_executable(exe_name) {
                return Some(path);
            }

            let possible_paths = vec![
                std::path::PathBuf::from(format!("/usr/bin/{}", exe_name)),
                std::path::PathBuf::from(format!("/usr/local/bin/{}", exe_name)),
                std::path::PathBuf::from(format!("/opt/{}/{}", exe_name, exe_name)),
                std::path::PathBuf::from(format!("/usr/share/{}/{}", exe_name, exe_name)),
                std::path::PathBuf::from(format!("/opt/{}/{}", folder_name, exe_name)),
                std::path::PathBuf::from(format!("/usr/share/{}/{}", folder_name, exe_name)),
            ];

            // User local installation and AppImage directories
            if let Some(home) = dirs::home_dir() {
                let user_local = home.join(format!(".local/bin/{}", exe_name));
                if let Some(path) = crate::modules::linux_paths::executable(&user_local) {
                    return Some(path);
                }

                if target_ide != Some("ide") {
                    for appimage_dir in [home.join("AppImages"), home.join("Applications")] {
                        if let Ok(entries) = std::fs::read_dir(&appimage_dir) {
                            let mut matches: Vec<_> = entries
                                .flatten()
                                .map(|e| e.path())
                                .filter(|p| {
                                    let file_name = p
                                        .file_name()
                                        .and_then(|n| n.to_str())
                                        .unwrap_or("")
                                        .to_lowercase();
                                    is_appimage_path(p)
                                        && file_name.contains("antigravity")
                                        && !file_name.contains("switch")
                                        && !file_name.contains("ide")
                                })
                                .collect();
                            matches.sort();
                            if let Some(found) = matches
                                .into_iter()
                                .find_map(|p| crate::modules::linux_paths::executable(&p))
                            {
                                return Some(found);
                            }
                        }
                    }
                }
            }

            for path in possible_paths {
                if let Some(resolved) = crate::modules::linux_paths::executable(&path) {
                    return Some(resolved);
                }
            }
        }
    }

    None
}

fn is_ide_name(value: &str) -> bool {
    let value = value.to_lowercase().replace(['-', '_'], " ");
    value.contains("antigravity ide")
}

/// AntiGravity Switch (the `antigravity-switch` / `agy-switch` app and console) lives in
/// a path containing "antigravity", but it is not the Antigravity App and must never be closed
/// or relaunched as one. Both arguments are lowercase.
fn is_switch_process(exe_path: &str, name: &str) -> bool {
    let file = exe_path.rsplit(['/', '\\']).next().unwrap_or(exe_path);
    file.starts_with("agy-switch")
        || name.starts_with("agy-switch")
        || file.starts_with("antigravity-switch")
        || name.starts_with("antigravity-swi")
        || file.starts_with("antigravity_switch")
        || name.starts_with("antigravity_swi")
        || exe_path.contains("antigravity switch.app")
}

/// Fuzzy match for the Antigravity App (not the IDE, not AntiGravity Switch itself).
fn is_app_candidate(exe_path: &str, name: &str) -> bool {
    (exe_path.contains("antigravity") || name.contains("antigravity"))
        && !is_ide_name(exe_path)
        && !is_ide_name(name)
        && !is_switch_process(exe_path, name)
}

#[cfg(test)]
mod app_candidate_tests {
    use super::{is_app_candidate, is_appimage_mount_exe, is_appimage_path, is_helper_process};
    #[cfg(target_os = "linux")]
    use super::parse_desktop_exec_line;
    use std::path::Path;

    #[test]
    fn antigravity_switch_is_never_taken_for_the_app() {
        for (path, name) in [
            ("/applications/antigravity switch.app/contents/macos/agy-switch-desktop", "agy-switch-desktop"),
            ("/applications/antigravity switch.app/contents/macos/agy-switch", "agy-switch"),
            ("/applications/antigravity switch.app/contents/resources/anything", "something"),
            ("c:\\program files\\antigravity switch\\agy-switch-desktop.exe", "agy-switch-desktop.exe"),
            ("/usr/bin/agy-switch", "agy-switch"),
            ("/usr/local/bin/antigravity-switch", "antigravity-switch"),
            ("/home/user/projects/antigravity-switch/src-tauri/target/release/antigravity-switch", "antigravity-switch"),
            ("", "antigravity-swi"),
        ] {
            assert!(!is_app_candidate(path, name), "{path} ({name}) is AntiGravity Switch, not the App");
        }
    }

    #[test]
    fn helper_process_filters_subprocesses_without_tripping_on_no_sandbox_flag() {
        assert!(!is_helper_process(
            "/tmp/.mount_antigraf5lth/antigravity",
            "antigravity",
            "--no-sandbox",
        ));
        assert!(is_helper_process(
            "/tmp/.mount_antigraf5lth/chrome-sandbox",
            "chrome-sandbox",
            "",
        ));
        assert!(is_helper_process(
            "/home/user/.gemini/antigravity/bin/language_server_linux_x64",
            "language_server",
            "--app_data_dir antigravity",
        ));
    }

    #[test]
    fn appimage_helpers_classify_paths_and_mounts() {
        assert!(is_appimage_mount_exe("/tmp/.mount_antigrAf5lTh/antigravity"));
        assert!(!is_appimage_mount_exe("/home/user/AppImages/antigravity.appimage"));
        assert!(is_appimage_path(Path::new("/home/user/AppImages/antigravity.appimage")));
        assert!(is_appimage_path(Path::new("/opt/Antigravity.AppImage")));
        assert!(!is_appimage_path(Path::new("/usr/bin/antigravity")));
    }

    #[cfg(target_os = "linux")]
    #[test]
    fn parses_desktop_exec_with_env_and_appimage_args() {
        let (exe, args) = parse_desktop_exec_line(
            "env DESKTOPINTEGRATION=1 /home/user/AppImages/antigravity.appimage --no-sandbox %U",
        )
        .unwrap();
        assert_eq!(exe, Path::new("/home/user/AppImages/antigravity.appimage"));
        assert_eq!(args, vec!["--no-sandbox"]);

        let (quoted_exe, quoted_args) = parse_desktop_exec_line(
            "\"/opt/My Apps/Antigravity.AppImage\" --user-data-dir=/tmp/data %F",
        )
        .unwrap();
        assert_eq!(quoted_exe, Path::new("/opt/My Apps/Antigravity.AppImage"));
        assert_eq!(quoted_args, vec!["--user-data-dir=/tmp/data"]);
        assert!(parse_desktop_exec_line("/usr/bin/antigravity-switch").is_none());
    }

    #[test]
    fn the_antigravity_app_is_still_recognized_and_the_ide_is_not() {
        for (path, name) in [
            ("/applications/antigravity.app/contents/macos/antigravity", "antigravity"),
            ("/usr/share/antigravity/antigravity", "antigravity"),
            ("c:\\users\\me\\appdata\\local\\programs\\antigravity\\antigravity.exe", "antigravity.exe"),
        ] {
            assert!(is_app_candidate(path, name), "{path} is the App");
        }
        assert!(!is_app_candidate("/applications/antigravity ide.app/contents/macos/electron", "electron"));
        assert!(!is_app_candidate("/usr/bin/zsh", "zsh"));
    }
}

#[cfg(test)]
mod close_wait_tests {
    use super::*;

    #[test]
    fn exit_wait_observes_delayed_exit_and_respects_the_deadline() {
        let now = std::time::Instant::now();
        assert!(wait_until_stopped(now, || false));
        assert!(!wait_until_stopped(now, || true));
        let mut polls = 0;
        assert!(wait_until_stopped(std::time::Instant::now() + Duration::from_millis(2), || {
            polls += 1;
            polls < 2
        }));
        assert_eq!(polls, 2);
        assert!(!wait_until_stopped(std::time::Instant::now() + Duration::from_millis(2), || true));
    }
}
