//! Terminal workflows use the same order operations as one-line commands.
use super::{output::{terminal_text, Snapshot}, picker::{self, KeyAction, Lang, RawTerminal}, settings, CliError};
use std::{io::{self, Write}, path::Path};

fn text<'a>(lang: Lang, zh: &'a str, en: &'a str) -> &'a str { if lang == Lang::Zh { zh } else { en } }

fn report(lang: Lang, result: Result<(), CliError>) {
    match result {
        Ok(()) => println!("{}", text(lang, "设置已保存。", "Settings saved.")),
        Err(e) => println!("{}", if lang == Lang::En { e.message } else { match e.code {
            3 => "账号已不存在，请重新加载账号列表。",
            5 => "设置已被其他端修改，或正在切换账号。请重新加载后再试。",
            _ => "无法读取或保存设置，请检查文件权限并重新加载。",
        } }),
    }
    picker::wait_for_key(lang);
}

pub(super) fn show_account_order(root: &Path, lang: Lang) {
    let result = Snapshot::read(root).and_then(|snapshot| {
        let expected = snapshot.accounts.iter().map(|a| a.id.clone()).collect::<Vec<_>>();
        if let Some(ordered) = edit_order(&snapshot, &expected, lang) {
            settings::save_account_order(root, &expected, &ordered)?;
            Ok(true)
        } else {
            Ok(false)
        }
    });
    match result {
        Ok(false) => {}
        Ok(true) => report(lang, Ok(())),
        Err(e) => report(lang, Err(e)),
    }
}

#[derive(Debug)]
struct OrderDraft { rows: Vec<(String, String)>, selected: usize }
impl OrderDraft {
    fn move_selected(&mut self, up: bool) {
        if self.rows.is_empty() { return; }
        let next = if up { self.selected.saturating_sub(1) } else { (self.selected + 1).min(self.rows.len() - 1) };
        self.rows.swap(self.selected, next);
        self.selected = next;
    }
    fn ids(&self) -> Vec<String> { self.rows.iter().map(|r| r.0.clone()).collect() }
}

fn edit_order(snapshot: &Snapshot, initial: &[String], lang: Lang) -> Option<Vec<String>> {
    let all = snapshot.accounts.iter().map(|a| &a.id).collect::<Vec<_>>();
    let ids = initial.iter().filter(|id| all.contains(id)).chain(all.iter().copied().filter(|id| !initial.contains(id)));
    let mut draft = OrderDraft {
        rows: ids.map(|id| {
            let a = snapshot.select(id).unwrap();
            let state = if a.disabled || a.validation_blocked || a.quota.as_ref().is_some_and(|q| q.is_forbidden) {
                text(lang, "（不可用）", " (unavailable)")
            } else {
                ""
            };
            (id.clone(), format!("{}{}", terminal_text(&a.email), state))
        }).collect(),
        selected: 0,
    };
    let Some(_raw) = RawTerminal::enter() else { return None; };
    loop {
        print!("\x1b[2J\x1b[H\x1b[?25l");
        println!("\x1b[1m{}\x1b[0m", text(lang, "账号列表顺序", "Account list order"));
        println!("{}", text(lang, "↑↓ 选择  Shift+↑↓ / U/D 调整顺序  Enter/→ 确认  Esc/← 取消", "Up/Down select  Shift+Up/Down or U/D reorder  Enter/Right apply  Esc/Left cancel"));
        let visible = picker::get_terminal_height().saturating_sub(6).max(1);
        let start = draft.selected.saturating_sub(visible - 1);
        for (i, (_, label)) in draft.rows.iter().enumerate().skip(start).take(visible) {
            let label = picker::truncate_display_width(label, picker::get_terminal_width().saturating_sub(10));
            println!("{} {:>3}. {}", if i == draft.selected { "➤" } else { " " }, i + 1, label);
        }
        if draft.rows.is_empty() { println!("{}", text(lang, "暂无账号。", "No saved accounts.")); }
        let _ = io::stdout().flush();
        match picker::read_key_action() {
            KeyAction::Cancel | KeyAction::Char('0') => return None,
            KeyAction::Enter => return if draft.rows.is_empty() { None } else { Some(draft.ids()) },
            KeyAction::Up if !draft.rows.is_empty() => draft.selected = if draft.selected == 0 { draft.rows.len() - 1 } else { draft.selected - 1 },
            KeyAction::Down if !draft.rows.is_empty() => draft.selected = (draft.selected + 1) % draft.rows.len(),
            KeyAction::Home => draft.selected = 0,
            KeyAction::End => draft.selected = draft.rows.len().saturating_sub(1),
            KeyAction::MoveUp | KeyAction::Char('u' | 'U') => draft.move_selected(true),
            KeyAction::MoveDown | KeyAction::Char('d' | 'D') => draft.move_selected(false),
            KeyAction::SelectIndex(i) if i < draft.rows.len() => draft.selected = i,
            _ => {},
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn moving_accounts_preserves_selection_and_stops_at_boundaries() {
        let mut draft = OrderDraft { rows: vec![("A".into(), "".into()), ("B".into(), "".into()), ("C".into(), "".into())], selected: 2 };
        draft.move_selected(true); assert_eq!(draft.ids(), vec!["A", "C", "B"]);
        draft.move_selected(true); assert_eq!(draft.ids(), vec!["C", "A", "B"]);
        draft.move_selected(true); assert_eq!(draft.selected, 0);
        draft.move_selected(false); assert_eq!(draft.ids(), vec!["A", "C", "B"]);
    }
}
