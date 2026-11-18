pub mod account;
pub mod account_dashboard;
pub mod account_service;
pub mod account_sync;
#[cfg(target_os = "windows")]
pub(crate) mod app_state_recovery;
pub mod cli_credentials;
pub mod config;
pub mod db;
pub mod device;
pub mod i18n;
pub mod integration;
#[cfg(target_os = "linux")]
pub mod linux_credentials;
#[cfg(target_os = "linux")]
pub mod linux_paths;
pub mod logger;
pub mod migration;
pub mod oauth;
pub mod oauth_server;
pub mod process;
pub mod project_resolver;
pub mod quota;
pub mod quota_refresh;
pub mod tray;
pub mod version;

// Re-export commonly used functions to the top level of the modules namespace for easy external calling
pub use account::*;
pub use config::*;
pub use quota::*;

pub mod desktop;
pub mod menu_bar_projection;
