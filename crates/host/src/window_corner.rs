//! 主窗口的真圆角：把窗口本身裁成圆角矩形，好让 UI 的圆角露出来。
//!
//! 参照 `design-241to300/241-to-300-frame-design/03-窗口无边框与圆角实现.md`。
//!
//! ## 和 Windows 缩放的关系
//!
//! 窗口的尺寸有两个口径：
//!
//!   * **逻辑尺寸**（DIP）：`tauri.conf.json` 里写的 900 x 600，Tauri 和页面都按它来。
//!   * **物理尺寸**（像素）：逻辑尺寸 x 缩放比例。125% 时是 1125 x 750，150% 时 1350 x 900。
//!
//! `SetWindowRgn` 只认**物理像素**。之前这里用的是 `window.inner_size()`，它给的是物理
//! 像素没错，但窗口一换缩放（把窗口拖到另一个显示器、或者系统改了缩放）就不会重算，
//! 旧区域还留着，多出来的部分被裁掉——看起来就是"内容被切了"。
//!
//! 现在改成：
//!
//!   1. 不用自己量尺寸，用 Win32 的 `GetClientRect` 现取（裁剪作用于窗口区域，正好对得上）；
//!   2. 半径按缩放比例算（60 DIP x scale），大屏上圆角不会显得变小；
//!   3. 窗口尺寸变了就重算（`apply` 之外给一个 `on_resized`，由窗口事件调）。
//!
//! 尺寸和圆角都走"当前是多少就按多少裁"，所以 Windows 的缩放设置改了也跟得上。

/// The window's corner radius in **logical** pixels (DIP). 3.0 的窗口圆角比 UI 的
/// `--screen-radius`（约 58）小得多：它只把窗口的四角修圆，UI 自己的黑角由
/// `.screen-corners` 画，两者不重合（owner 2026-11-23 对比 3.0 截图：60 切得太深，
/// 26 才和 3.0 一致）。按窗口的缩放比例乘一下，150% 的屏上圆角看着一样大。
const CORNER_RADIUS_DIP: f64 = 26.0;

/// Cuts `window` (its handle) into a rounded rectangle, at the scale `scale` Windows reports for it.
///
/// The region is asked of the window itself (`GetClientRect`), so whatever size and DPI the window
/// currently is, the region matches it — no stale size from a previous resize or monitor.
pub fn apply(window: isize, scale: f64) {
    #[cfg(windows)]
    {
        use windows::Win32::Foundation::{HWND, RECT};
        use windows::Win32::Graphics::Gdi::{CreateRoundRectRgn, SetWindowRgn};
        use windows::Win32::UI::WindowsAndMessaging::GetClientRect;

        if window == 0 {
            return;
        }
        let scale = if scale > 0.0 { scale } else { 1.0 };
        // SAFETY: `window` is the caller's own window handle, alive through the call; `rect` is a
        // local `RECT` the call fills. `CreateRoundRectRgn` makes a region this thread owns, and
        // `SetWindowRgn` takes that ownership over on success — so the region must NOT be deleted
        // afterwards, which is why it is never passed to `DeleteObject` here.
        unsafe {
            let hwnd = HWND(window as *mut _);
            let mut rect = RECT::default();
            if GetClientRect(hwnd, &mut rect).is_err() {
                return;
            }
            let (width, height) = (rect.right - rect.left, rect.bottom - rect.top);
            if width <= 0 || height <= 0 {
                return;
            }
            // A radius larger than half the short side would make the region fold on itself.
            let radius = ((CORNER_RADIUS_DIP * scale).round() as i32).min(width.min(height) / 2);
            // `CreateRoundRectRgn` wants the corner's diameter, and its rectangle is exclusive on the
            // right and bottom edges — hence the +1, without which the last pixel row and column
            // would be cut off.
            let region = CreateRoundRectRgn(0, 0, width + 1, height + 1, radius * 2, radius * 2);
            if !region.is_invalid() {
                SetWindowRgn(hwnd, Some(region), true);
            }
        }
    }
    #[cfg(not(windows))]
    {
        let _ = (window, scale);
    }
}
