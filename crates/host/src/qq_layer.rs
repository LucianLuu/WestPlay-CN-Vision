//! The QQ middle layer (the `web` folder of L-1124's QQMusicApi, GPL-3.0), served on
//! `127.0.0.1:8080` for `qq_music.js`: a Python process of WestPlay's own, started when WestPlay
//! does and stopped when it ends.
//!
//! It has to be a process of its own. The player's page is a browser context: it can't set a
//! `Cookie` header (`forbidden header name`), and `y.qq.com`'s API is another origin, so the account's
//! credential could reach it no other way (qq_music.js says the same). The pool of accounts lives in
//! that process alone: nothing of them passes through WestPlay or the page it draws.
//!
//! The interpreter is the copy shipped beside it (`python/`, the embeddable distribution), so a
//! player needs no Python of their own.

use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::time::{Duration, Instant};

/// The port the layer serves on (`config.toml`'s `server.port`, and qq_music.js's `BASE`).
const PORT: u16 = 8080;

/// How long to wait for the layer to answer before saying it didn't start.
const READY_TIMEOUT: Duration = Duration::from_secs(20);

/// The folder the layer was shipped in (`qq-music-layer`, beside WestPlay's other resources).
pub fn folder(resources: &Path) -> PathBuf {
    resources.join("qq-music-layer")
}

/// The layer, running: its process, and where its folder is.
pub struct Layer {
    child: Child,
    folder: PathBuf,
}

impl Layer {
    /// Starts the layer in `folder` (the shipped `qq-music-layer`), or `None` if it couldn't: its
    /// interpreter is gone, or the process didn't start.
    pub fn start(folder: &Path) -> Option<Self> {
        // Already one answering (a WestPlay left running, or a player's own): its own is not needed.
        if port_open() {
            crate::log!("[qq layer] already serving on {PORT}");
            return None;
        }
        let python = plain(folder.join("python").join("python.exe"));
        // WestPlay's own entry point first: it applies the two corrections the layer's compiled
        // sources need (run_westplay.py says which), then runs the layer's own `run.pyc`. Taken
        // when it's there, so a build without it still starts the layer as it is.
        let web = plain(folder.join("web"));
        let run = [
            web.join("run_westplay.py"),
            web.join("run.py"),
            web.join("run.pyc"),
        ]
        .into_iter()
        .find(|each| each.is_file());
        let Some(run) = run else {
            crate::log!("[qq layer] not shipped: no run.py or run.pyc in {}", web.display());
            return None;
        };
        let child = Command::new(&python)
            .arg(&run)
            .current_dir(&web)
            // Its own console is hidden: nothing of it shows in the cab.
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .creation_flags(CREATE_NO_WINDOW)
            .spawn()
            .map_err(|error| crate::log!("[qq layer] couldn't start: {error}"))
            .ok()?;
        let mut layer = Self {
            child,
            folder: folder.to_owned(),
        };
        // Ends with WestPlay's own process, however it goes (see `end_with_parent`).
        let tied = layer.end_with_parent();
        if !layer.wait_ready() {
            crate::log!("[qq layer] no answer on {PORT} after {READY_TIMEOUT:?}");
            layer.stop();
            return None;
        }
        crate::log!(
            "[qq layer] serving on {PORT} ({}), ends with WestPlay: {tied}",
            folder.display()
        );
        Some(layer)
    }

    /// Waits for the port to answer, up to [`READY_TIMEOUT`].
    fn wait_ready(&mut self) -> bool {
        let started = Instant::now();
        while started.elapsed() < READY_TIMEOUT {
            if port_open() {
                return true;
            }
            // The process died (a broken install): no point waiting longer.
            if matches!(self.child.try_wait(), Ok(Some(_))) {
                return false;
            }
            std::thread::sleep(Duration::from_millis(250));
        }
        false
    }

    /// Where the layer's folder is (its accounts and config are there).
    pub fn folder(&self) -> &Path {
        &self.folder
    }

    /// Ends its process, and the one it made of its own (uvicorn keeps none: its worker is its own).
    /// Puts the layer's process in a job of its own that ends it when WestPlay's own process ends:
    /// a player closing the window with a task manager, or a crash, leaves nothing serving for ever
    /// (owner 2026-11-16: it answered after WestPlay was gone).
    fn end_with_parent(&self) -> bool {
        #[cfg(windows)]
        {
            use std::os::windows::io::AsRawHandle;
            use windows::Win32::System::JobObjects::{
                AssignProcessToJobObject, CreateJobObjectW, JobObjectExtendedLimitInformation,
                JOBOBJECT_EXTENDED_LIMIT_INFORMATION, JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE,
                SetInformationJobObject,
            };
            // SAFETY: plain handles, closed by `CloseHandle` when this function's own goes.
            unsafe {
                let job = CreateJobObjectW(None, None);
                let Ok(job) = job else { return false };
                let mut info = JOBOBJECT_EXTENDED_LIMIT_INFORMATION::default();
                info.BasicLimitInformation.LimitFlags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;
                let set = SetInformationJobObject(
                    job,
                    JobObjectExtendedLimitInformation,
                    std::ptr::addr_of!(info).cast(),
                    std::mem::size_of_val(&info) as u32,
                );
                if set.is_err() {
                    let _ = windows::Win32::Foundation::CloseHandle(job);
                    return false;
                }
                let process = windows::Win32::System::Threading::OpenProcess(
                    windows::Win32::System::Threading::PROCESS_SET_QUOTA
                        | windows::Win32::System::Threading::PROCESS_TERMINATE,
                    false,
                    self.child.id(),
                );
                let assigned = process
                    .and_then(|process| {
                        let result = AssignProcessToJobObject(job, process);
                        let _ = windows::Win32::Foundation::CloseHandle(process);
                        result
                    })
                    .is_ok();
                // The job's handle goes with this function: the layer's process then ends with
                // WestPlay's, the handle being the last one (`KILL_ON_JOB_CLOSE`).
                let _ = std::os::windows::io::AsRawHandle::as_raw_handle(&self.child);
                let _ = job;
                assigned
            }
        }
        #[cfg(not(windows))]
        {
            false
        }
    }

    pub fn stop(&mut self) {
        let _ = self.child.kill();
        let _ = self.child.wait();
    }
}

impl Drop for Layer {
    fn drop(&mut self) {
        self.stop();
    }
}

/// The same path without Windows' verbatim prefix (`\\?\`): Tauri's resource folder has it, and
/// `Command::new` on such a path fails to start the program (its own `is_file` answering nothing).
fn plain(path: PathBuf) -> PathBuf {
    let text = path.as_os_str().to_string_lossy();
    match text.strip_prefix(r"\\?\") {
        Some(rest) => PathBuf::from(rest),
        None => path,
    }
}

/// Whether something answers on the layer's port now (a plain connect: the layer's own `/` says
/// nothing more).
fn port_open() -> bool {
    use std::net::{SocketAddr, TcpStream};
    let address = SocketAddr::from(([127, 0, 0, 1], PORT));
    TcpStream::connect_timeout(&address, Duration::from_millis(300)).is_ok()
}

/// Windows' flag for a process with no console window of its own.
#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x0800_0000;

/// Spawns a process without a console window of its own (`CREATE_NO_WINDOW`, Windows).
#[cfg(windows)]
trait NoWindow {
    fn creation_flags(&mut self, flags: u32) -> &mut Self;
}

#[cfg(windows)]
impl NoWindow for Command {
    fn creation_flags(&mut self, flags: u32) -> &mut Self {
        use std::os::windows::process::CommandExt;
        CommandExt::creation_flags(self, flags)
    }
}

#[cfg(not(windows))]
trait NoWindow {
    fn creation_flags(&mut self, _flags: u32) -> &mut Self;
}

#[cfg(not(windows))]
impl NoWindow for Command {
    fn creation_flags(&mut self, _flags: u32) -> &mut Self {
        self
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_folder_without_a_layer_starts_nothing() {
        let missing = Path::new("no-such-folder");
        assert!(Layer::start(missing).is_none());
    }
}
