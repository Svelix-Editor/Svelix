use std::process::{Command, Stdio, ChildStdin};
use std::io::{Write, BufReader, BufRead, Read};
use std::thread;
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Emitter, Manager};

pub struct LspState {
    pub stdin: Arc<Mutex<Option<ChildStdin>>>,
}

impl Default for LspState {
    fn default() -> Self {
        Self {
            stdin: Arc::new(Mutex::new(None)),
        }
    }
}

#[tauri::command]
pub fn start_lsp(app_handle: AppHandle, cmd: String, args: Vec<String>, state: tauri::State<LspState>) -> Result<String, String> {
    let mut child = Command::new(&cmd)
        .args(args)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped()) // Stderrも取得しておくとデバッグに便利
        .spawn()
        .map_err(|e| format!("Failed to spawn LSP: {}", e))?;

    let stdin = child.stdin.take().ok_or("Failed to open stdin")?;
    let stdout = child.stdout.take().ok_or("Failed to open stdout")?;
    let stderr = child.stderr.take().ok_or("Failed to open stderr")?;

    // StdinをStateに保存
    let mut state_stdin = state.stdin.lock().map_err(|_| "Failed to lock mutex")?;
    *state_stdin = Some(stdin);

    // Stdout読み取りスレッド
    let app_handle_clone = app_handle.clone();
    thread::spawn(move || {
        let mut reader = BufReader::new(stdout);
        loop {
            // ヘッダー読み込み (Content-Length)
            let mut header = String::new();
            if let Err(_) = reader.read_line(&mut header) {
                break;
            }
            if header.trim().is_empty() {
                continue; // 空行はスキップ（あるいは接続終了）
            }

            // ここでは簡易的に全ての出力をそのままイベントとして流す
            // 本来はContent-Lengthをパースして正確にJSON部分を切り出すべきだが
            // まずは疎通確認のため、読み取った内容をそのまま流す実装にする
            // ただし、LSPはヘッダーの後にJSONが来るので、read_lineだけだとJSONの一部しか読めない可能性がある
            // 簡易実装として、Content-Lengthが見つかったらその分読む、というロジックを入れる
            
            let content_length = if header.starts_with("Content-Length: ") {
                header.trim()["Content-Length: ".len()..].parse::<usize>().unwrap_or(0)
            } else {
                0
            };

            if content_length > 0 {
                // \r\n を読み飛ばす
                let mut separator = String::new();
                let _ = reader.read_line(&mut separator); // Content-Typeなどが来る場合もあるが今回は簡易化

                // ボディを読む
                let mut body_buf = vec![0; content_length];
                if let Ok(_) = reader.read_exact(&mut body_buf) {
                    if let Ok(body_str) = String::from_utf8(body_buf) {
                         let _ = app_handle_clone.emit("lsp-message", body_str);
                    }
                }
            } else {
                 // その他の出力（ログなど）
                 let _ = app_handle_clone.emit("lsp-log", header);
            }
        }
    });

    // Stderr読み取りスレッド
    let app_handle_clone2 = app_handle.clone();
    thread::spawn(move || {
        let reader = BufReader::new(stderr);
        for line in reader.lines() {
             if let Ok(l) = line {
                 let _ = app_handle_clone2.emit("lsp-error", l);
             }
        }
    });

    Ok(format!("LSP started: {}", cmd))
}

#[tauri::command]
pub fn send_lsp_message(message: String, state: tauri::State<LspState>) -> Result<(), String> {
    let mut state_stdin = state.stdin.lock().map_err(|_| "Failed to lock mutex")?;
    
    if let Some(stdin) = state_stdin.as_mut() {
        let payload = format!("Content-Length: {}\r\n\r\n{}", message.len(), message);
        stdin.write_all(payload.as_bytes()).map_err(|e| e.to_string())?;
        stdin.flush().map_err(|e| e.to_string())?;
        Ok(())
    } else {
        Err("LSP is not running".to_string())
    }
}

