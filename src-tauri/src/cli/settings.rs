use super::{output::{terminal_text, Snapshot}, CliError, Result};
use std::{collections::HashSet, path::Path};

fn same_members(a: &[String], b: &[String]) -> bool {
    a.len() == b.len() && a.iter().collect::<HashSet<_>>() == b.iter().collect::<HashSet<_>>()
}

pub(super) fn save_account_order(root: &Path, expected: &[String], ordered: &[String]) -> Result<()> {
    if !same_members(expected, ordered) || ordered.iter().collect::<HashSet<_>>().len() != ordered.len() {
        return Err(CliError::usage());
    }
    crate::modules::account::reorder_accounts_at(root, ordered, Some(expected)).map_err(|e| match e.as_str() {
        "account_order_changed" => CliError { code: 5, message: "Account order changed in another client. Reload and retry." },
        "another_account_switch_in_progress" => CliError { code: 5, message: "Another switch or settings change is in progress. Wait and retry." },
        _ => CliError::data("Cannot save account order. Reload before retrying."),
    })
}

pub(super) fn order_accounts(root: &Path, selectors: &[String], json: bool) -> Result<String> {
    let snapshot = Snapshot::read(root)?;
    let current = snapshot.accounts.iter().map(|a| a.id.clone()).collect::<Vec<_>>();
    let ordered = if selectors.is_empty() {
        current.clone()
    } else {
        let ids = selectors
            .iter()
            .map(|s| snapshot.select(s).map(|a| a.id.clone()))
            .collect::<Result<Vec<_>>>()?;
        if ids.iter().collect::<HashSet<_>>().len() != ids.len() {
            return Err(CliError { code: 2, message: "Each account must appear only once." });
        }
        ids
    };
    if !selectors.is_empty() {
        save_account_order(root, &current, &ordered)?;
    }
    Ok(if json {
        serde_json::json!({"schema_version": 1, "account_ids": ordered}).to_string()
    } else {
        ordered
            .iter()
            .enumerate()
            .map(|(i, id)| format!("{}. {}  {}", i + 1, terminal_text(id), terminal_text(&snapshot.select(id).unwrap().email)))
            .collect::<Vec<_>>()
            .join("\n")
    })
}

pub(super) fn set_label(root: &Path, selector: &str, label: &str, json: bool) -> Result<String> {
    let snapshot = Snapshot::read(root)?;
    let account = snapshot.select(selector)?;
    let trimmed = label.trim();
    crate::modules::account::set_account_label_at(root, &account.id, trimmed).map_err(|err| {
        if err.contains("15 characters") {
            CliError {
                code: 2,
                message: "Label cannot exceed 15 characters.",
            }
        } else {
            CliError::data("Cannot update account label.")
        }
    })?;
    let label_opt = (!trimmed.is_empty()).then_some(trimmed);
    Ok(if json {
        serde_json::json!({
            "schema_version": 1,
            "account_id": account.id,
            "email": account.email,
            "custom_label": label_opt
        })
        .to_string()
    } else if let Some(value) = label_opt {
        format!(
            "Updated label for {} to '{}'.",
            terminal_text(&account.email),
            terminal_text(value)
        )
    } else {
        format!("Cleared label for {}.", terminal_text(&account.email))
    })
}
