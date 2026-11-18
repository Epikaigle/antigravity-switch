use crate::modules;
use tauri::{
    image::Image,
    menu::{Menu, MenuItem, PredefinedMenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Emitter, Listener,
};

fn labels(language: &str) -> &'static str {
    if language.starts_with("fr") {
        "Tableau de bord"
    } else if language.starts_with("zh") {
        "仪表盘"
    } else {
        "Dashboard"
    }
}

fn account_display_name(account: &modules::account_dashboard::DashboardEntry) -> String {
    let custom = account.custom_label.as_deref().unwrap_or("").trim();
    if !custom.is_empty() && custom != account.email {
        if account.email.is_empty() {
            custom.to_string()
        } else {
            format!("{custom} ({})", account.email)
        }
    } else if !account.email.is_empty() {
        account.email.clone()
    } else {
        account
            .name
            .as_deref()
            .map(str::trim)
            .filter(|s| !s.is_empty())
            .unwrap_or(&account.id)
            .to_string()
    }
}

fn account_menu_label(
    index: usize,
    account: &modules::account_dashboard::DashboardEntry,
    is_current: bool,
    switchable: bool,
    language: &str,
) -> String {
    let n = index + 1;
    let name = account_display_name(account);
    let (prefix, active_tag, unavailable_tag) = if language.starts_with("fr") {
        (format!("Compte {n}"), "Actif", "Indisponible")
    } else if language.starts_with("zh") {
        (format!("账号 {n}"), "当前", "不可用")
    } else {
        (format!("Account {n}"), "Active", "Unavailable")
    };
    if is_current {
        format!("✓ {prefix} · {name} ({active_tag})")
    } else if !switchable {
        format!("{prefix} · {name} ({unavailable_tag})")
    } else {
        format!("{prefix} · {name}")
    }
}

fn build_menu(app: &tauri::AppHandle) -> tauri::Result<Menu<tauri::Wry>> {
    let config = modules::load_app_config().unwrap_or_default();
    let texts = modules::i18n::get_tray_texts(&config.language);
    let dashboard = labels(&config.language);
    let snapshot = modules::account_dashboard::snapshot().ok();
    let current = snapshot.as_ref().and_then(|snapshot| {
        snapshot
            .accounts
            .iter()
            .find(|account| Some(&account.id) == snapshot.current_account_id.as_ref())
    });
    let user_text = format!(
        "{}: {}",
        texts.saved,
        current
            .as_ref()
            .map(|a| account_display_name(a))
            .unwrap_or_else(|| texts.no_account.clone())
    );
    let now = chrono::Utc::now().timestamp();
    let quota_lines = modules::menu_bar_projection::saved_quota_lines(
        current,
        now,
        config.refresh_interval,
        &config.language,
    );
    let menu = Menu::new(app)?;
    menu.append(&MenuItem::with_id(
        app,
        "dashboard",
        dashboard,
        true,
        None::<&str>,
    )?)?;
    menu.append(&PredefinedMenuItem::separator(app)?)?;
    menu.append(&MenuItem::with_id(
        app,
        "info_user",
        user_text,
        false,
        None::<&str>,
    )?)?;
    for (index, text) in quota_lines.iter().enumerate() {
        menu.append(&MenuItem::with_id(
            app,
            format!("quota_{index}"),
            text,
            false,
            None::<&str>,
        )?)?;
    }
    menu.append(&PredefinedMenuItem::separator(app)?)?;
    if let Some(ref snap) = snapshot {
        if snap.accounts.is_empty() {
            menu.append(&MenuItem::with_id(
                app,
                "no_accounts",
                &texts.no_account,
                false,
                None::<&str>,
            )?)?;
        } else {
            for (index, account) in snap.accounts.iter().enumerate() {
                let is_current = Some(&account.id) == snap.current_account_id.as_ref();
                let switchable =
                    modules::menu_bar_projection::switchable_account(account, now);
                let label = account_menu_label(
                    index,
                    account,
                    is_current,
                    switchable,
                    &config.language,
                );
                let enabled = switchable && !is_current;
                menu.append(&MenuItem::with_id(
                    app,
                    format!("switch_account:{}", account.id),
                    label,
                    enabled,
                    None::<&str>,
                )?)?;
            }
        }
    } else {
        menu.append(&MenuItem::with_id(
            app,
            "no_accounts",
            &texts.no_account,
            false,
            None::<&str>,
        )?)?;
    }
    menu.append(&PredefinedMenuItem::separator(app)?)?;
    menu.append(&MenuItem::with_id(
        app,
        "quit",
        texts.quit,
        true,
        None::<&str>,
    )?)?;
    Ok(menu)
}

pub fn create_tray(app: &tauri::AppHandle) -> tauri::Result<()> {
    #[cfg(target_os = "macos")]
    let icon_bytes: &[u8] = include_bytes!("../../icons/tray-icon.png");
    #[cfg(not(target_os = "macos"))]
    let icon_bytes: &[u8] = include_bytes!("../../icons/icon.png");
    let img = image::load_from_memory(icon_bytes)
        .map_err(|e| tauri::Error::Io(std::io::Error::other(e.to_string())))?
        .to_rgba8();
    let icon = Image::new_owned(img.clone().into_raw(), img.width(), img.height());
    TrayIconBuilder::with_id("main")
        .menu(&build_menu(app)?)
        // Linux does not deliver TrayIconEvent::Click, so retain its native menu.
        .show_menu_on_left_click(cfg!(target_os = "linux"))
        .tooltip("AntiGravity Switch")
        .icon(icon)
        .icon_as_template(cfg!(target_os = "macos"))
        .on_menu_event(|app, event| {
            let id = event.id().as_ref();
            if id == "dashboard" {
                open_dashboard(app, None);
                return;
            }
            if id == "quit" {
                app.exit(0);
                return;
            }
            if let Some(target_id) = id.strip_prefix("switch_account:") {
                use std::sync::atomic::{AtomicBool, Ordering};
                static BUSY: AtomicBool = AtomicBool::new(false);
                if BUSY
                    .compare_exchange(false, true, Ordering::AcqRel, Ordering::Relaxed)
                    .is_err()
                {
                    return;
                }
                let app = app.clone();
                let target_id = target_id.to_string();
                tauri::async_runtime::spawn(async move {
                    struct Release;
                    impl Drop for Release {
                        fn drop(&mut self) {
                            BUSY.store(false, Ordering::Release);
                        }
                    }
                    let _release = Release;
                    let Ok(snapshot) = modules::account_dashboard::snapshot() else {
                        return;
                    };
                    let now = chrono::Utc::now().timestamp();
                    let Some(target) = snapshot.accounts.iter().find(|account| {
                        account.id == target_id
                            && Some(&account.id) != snapshot.current_account_id.as_ref()
                            && modules::menu_bar_projection::switchable_account(account, now)
                    }) else {
                        return;
                    };
                    let next_id = target.id.clone();
                    match crate::commands::switch_account(app.clone(), next_id.clone(), None).await
                    {
                        Ok(()) => {
                            let _ = app.emit("tray://account-switched", next_id);
                        }
                        Err(error) => {
                            let _ = app.emit("menubar://error", error);
                        }
                    }
                });
            }
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                rect,
                ..
            } = event
            {
                open_dashboard(tray.app_handle(), Some(rect));
            }
        })
        .build(app)?;
    #[cfg(not(target_os = "macos"))]
    modules::desktop::warm_dashboard(app);
    let handle = app.clone();
    app.listen("config://updated", move |_| {
        update_tray_menus(&handle);
    });
    Ok(())
}

fn open_dashboard(app: &tauri::AppHandle, rect: Option<tauri::Rect>) {
    let app = app.clone();
    // WebView2 creation must not run synchronously in the Windows event loop.
    tauri::async_runtime::spawn_blocking(move || {
        if let Err(error) = modules::desktop::toggle_dashboard(&app, rect) {
            modules::logger::log_warn(&format!("Quick dashboard unavailable: {error}"));
            let _ = modules::desktop::show_main(&app);
        }
    });
}

pub fn update_tray_menus(app: &tauri::AppHandle) {
    let app = app.clone();
    let handle = app.clone();
    let _ = handle.run_on_main_thread(move || {
        if let (Some(tray), Ok(menu)) = (app.tray_by_id("main"), build_menu(&app)) {
            let _ = tray.set_menu(Some(menu));
        }
        // One event updates both windows after add/delete/refresh/switch actions.
        let _ = app.emit("menubar://data-updated", ());
    });
}

#[cfg(test)]
mod tests {
    use super::{account_display_name, account_menu_label, labels};
    use crate::modules::account_dashboard::DashboardEntry;

    fn sample_entry(email: &str, custom_label: Option<&str>) -> DashboardEntry {
        DashboardEntry {
            id: "acc-1".into(),
            email: email.into(),
            name: Some("Shared Name".into()),
            custom_label: custom_label.map(str::to_string),
            read_status: "loaded",
            read_error: None,
            disabled: false,
            validation_blocked: false,
            validation_blocked_until: None,
            protected_models: Vec::new(),
            quota: None,
        }
    }

    #[test]
    fn tray_dashboard_label_localized() {
        assert_eq!(labels("fr"), "Tableau de bord");
        assert_eq!(labels("zh-CN"), "仪表盘");
        assert_eq!(labels("en"), "Dashboard");
    }

    #[test]
    fn tray_account_labels_include_number_and_name() {
        let plain = sample_entry("alice@example.com", None);
        let labeled = sample_entry("bob@example.com", Some("Travail"));
        assert_eq!(account_display_name(&plain), "alice@example.com");
        assert_eq!(account_display_name(&labeled), "Travail (bob@example.com)");
        assert_eq!(
            account_menu_label(0, &plain, true, true, "fr"),
            "✓ Compte 1 · alice@example.com (Actif)"
        );
        assert_eq!(
            account_menu_label(1, &labeled, false, true, "fr"),
            "Compte 2 · Travail (bob@example.com)"
        );
        assert_eq!(
            account_menu_label(2, &plain, false, false, "fr"),
            "Compte 3 · alice@example.com (Indisponible)"
        );
    }
}
