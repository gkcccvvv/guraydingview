#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Guraydingview — run without a console window, with an icon in the notification area (system tray).

    pythonw tray.py                    -> starts the server, shows the tray icon, opens the browser
    pythonw tray.py --no-open --quiet  -> no browser, no notification (used when starting with Windows)

Click the icon: open the app. Right-click: open, restart, refresh data, log file, folder, desktop / Start menu
shortcut, start with Windows, exit. Python standard library + the Windows API (ctypes) only.
"""
import ctypes
import ctypes.wintypes as wt
import os
import shutil
import struct
import subprocess
import sys
import threading
import time
import webbrowser
import zlib

APP = "Guraydingview"
ROOT = os.path.dirname(os.path.abspath(__file__))
os.chdir(ROOT)
DATA_DIR = os.path.join(ROOT, "data")
LOG_FILE = os.path.join(DATA_DIR, "server.log")
ICON_FILE = os.path.join(ROOT, "static", "favicon.ico")
ICON_SIZES = (16, 24, 32, 48, 64, 128, 256)
APPDATA = os.environ.get("APPDATA", "")
STARTUP_DIR = os.path.join(APPDATA, "Microsoft", "Windows", "Start Menu", "Programs", "Startup")
STARTUP_VBS = os.path.join(STARTUP_DIR, APP + ".vbs")
LEGACY_VBS = os.path.join(STARTUP_DIR, "Grafik Masasi.vbs")  # name used by earlier versions
START_MENU_LNK = os.path.join(APPDATA, "Microsoft", "Windows", "Start Menu", "Programs", APP + ".lnk")
FOLDER_LNK = os.path.join(ROOT, APP + ".lnk")
CREATE_NO_WINDOW = 0x08000000


def setup_log():
    """pythonw has no console: write output to data/server.log."""
    os.makedirs(DATA_DIR, exist_ok=True)
    try:
        if os.path.getsize(LOG_FILE) > 2_000_000:
            os.replace(LOG_FILE, LOG_FILE + ".old")
    except OSError:
        pass
    f = open(LOG_FILE, "a", encoding="utf-8", buffering=1, errors="replace")
    sys.stdout = sys.stderr = f
    print(f"\n--- {time.strftime('%Y-%m-%d %H:%M:%S')} {APP} starting (tray icon)")


setup_log()
sys.path.insert(0, ROOT)
import server  # noqa: E402  (after redirecting the log)


# ----------------------------------------------------------------------------
# icon: drawn in code (dark rounded square, blue line, green/red candles) and saved as .ico
# ----------------------------------------------------------------------------
def _render(S):
    BG, BLUE, UP, DOWN = (19, 23, 34), (41, 98, 255), (8, 153, 129), (242, 54, 69)
    line = [(8, 50), (22, 38), (33, 44), (56, 14)]
    candles = [(17, 30, 46, 22, 52, UP), (31, 24, 38, 17, 44, DOWN), (45, 13, 30, 7, 36, UP)]

    def in_rrect(u, v, x0, y0, x1, y1, r):
        if not (x0 <= u <= x1 and y0 <= v <= y1):
            return False
        cx = min(max(u, x0 + r), x1 - r)
        cy = min(max(v, y0 + r), y1 - r)
        return (u - cx) ** 2 + (v - cy) ** 2 <= r * r

    def seg_dist(u, v, a, b):
        (x1, y1), (x2, y2) = a, b
        dx, dy = x2 - x1, y2 - y1
        t = max(0.0, min(1.0, ((u - x1) * dx + (v - y1) * dy) / (dx * dx + dy * dy)))
        return ((u - x1 - t * dx) ** 2 + (v - y1 - t * dy) ** 2) ** 0.5

    px = bytearray(S * S * 4)
    k = 64 / S
    for y in range(S):
        v = (y + 0.5) * k
        for x in range(S):
            u = (x + 0.5) * k
            if not in_rrect(u, v, 1, 1, 63, 63, 14):
                continue
            col = BG
            if min(seg_dist(u, v, line[i], line[i + 1]) for i in range(len(line) - 1)) <= 2.6:
                col = BLUE
            for cx, top, bot, wtop, wbot, c in candles:
                if (abs(u - cx) <= 4.5 and top <= v <= bot) or (abs(u - cx) <= 1.1 and wtop <= v <= wbot):
                    col = c
            i = (y * S + x) * 4
            px[i:i + 4] = bytes((*col, 255))
    return px


def _downsample(px, S, n):
    f = S // n
    out = bytearray(n * n * 4)
    for y in range(n):
        for x in range(n):
            r = g = b = a = 0
            for yy in range(y * f, y * f + f):
                base = yy * S
                for xx in range(x * f, x * f + f):
                    i = (base + xx) * 4
                    al = px[i + 3]
                    if al:
                        r += px[i] * al
                        g += px[i + 1] * al
                        b += px[i + 2] * al
                        a += al
            if a:
                o = (y * n + x) * 4
                out[o:o + 4] = bytes((r // a, g // a, b // a, a // (f * f)))
    return out


def _png(n, rgba):
    raw = b"".join(b"\x00" + bytes(rgba[y * n * 4:(y + 1) * n * 4]) for y in range(n))

    def chunk(t, d):
        return struct.pack(">I", len(d)) + t + d + struct.pack(">I", zlib.crc32(t + d) & 0xFFFFFFFF)
    return (b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", n, n, 8, 6, 0, 0, 0))
            + chunk(b"IDAT", zlib.compress(raw, 9)) + chunk(b"IEND", b""))


def ensure_icon():
    if os.path.exists(ICON_FILE):
        return
    S = 768  # divisible by every icon size, so downsampling is exact
    px = _render(S)
    imgs = [(n, _png(n, _downsample(px, S, n))) for n in ICON_SIZES]
    head = struct.pack("<HHH", 0, 1, len(imgs))
    off, dirs, data = 6 + 16 * len(imgs), b"", b""
    for n, png in imgs:
        dirs += struct.pack("<BBBBHHII", n % 256, n % 256, 0, 0, 1, 32, len(png), off + len(data))
        data += png
    os.makedirs(os.path.dirname(ICON_FILE), exist_ok=True)
    with open(ICON_FILE, "wb") as f:
        f.write(head + dirs + data)


# ----------------------------------------------------------------------------
# shortcuts (.lnk with the app icon) and start with Windows
# ----------------------------------------------------------------------------
def pythonw_exe():
    exe = sys.executable
    if exe.lower().endswith("python.exe"):
        cand = exe[:-10] + "pythonw.exe"
        if os.path.exists(cand):
            return cand
    return exe


def create_shortcut(lnk_path):
    """Create a Windows shortcut that starts the tray app, with the Guraydingview icon."""
    q = lambda p: p.replace("'", "''")  # noqa: E731  (PowerShell single-quote escaping)
    tray_py = os.path.join(ROOT, "tray.py")
    ps = (f"$s=(New-Object -ComObject WScript.Shell).CreateShortcut('{q(lnk_path)}');"
          f"$s.TargetPath='{q(pythonw_exe())}';$s.Arguments='\"{q(tray_py)}\"';"
          f"$s.WorkingDirectory='{q(ROOT)}';$s.IconLocation='{q(ICON_FILE)},0';"
          f"$s.Description='{APP} - charts with unlimited drawings';$s.Save()")
    subprocess.run(["powershell", "-NoProfile", "-NonInteractive", "-Command", ps],
                   creationflags=CREATE_NO_WINDOW, timeout=30, check=True)


def desktop_dir():
    try:
        out = subprocess.run(["powershell", "-NoProfile", "-NonInteractive", "-Command",
                              "[Environment]::GetFolderPath('Desktop')"],
                             capture_output=True, text=True, creationflags=CREATE_NO_WINDOW, timeout=20)
        if out.stdout.strip():
            return out.stdout.strip()
    except Exception:
        pass
    return os.path.join(os.path.expanduser("~"), "Desktop")


def autostart_enabled():
    return os.path.exists(STARTUP_VBS) or os.path.exists(LEGACY_VBS)


def set_autostart(on):
    if os.path.exists(LEGACY_VBS):
        os.remove(LEGACY_VBS)
    if on:
        vbs = ('CreateObject("WScript.Shell").Run """{}"" ""{}"" --no-open --quiet", 0, False\r\n'
               .format(pythonw_exe(), os.path.join(ROOT, "tray.py")))
        with open(STARTUP_VBS, "w", encoding="mbcs") as f:
            f.write(vbs)
    elif os.path.exists(STARTUP_VBS):
        os.remove(STARTUP_VBS)


# ----------------------------------------------------------------------------
# Windows API (ctypes)
# ----------------------------------------------------------------------------
user32 = ctypes.WinDLL("user32", use_last_error=True)
shell32 = ctypes.WinDLL("shell32", use_last_error=True)
kernel32 = ctypes.WinDLL("kernel32", use_last_error=True)
LRESULT = ctypes.c_ssize_t
WNDPROC = ctypes.WINFUNCTYPE(LRESULT, wt.HWND, wt.UINT, wt.WPARAM, wt.LPARAM)


class WNDCLASSW(ctypes.Structure):
    _fields_ = [("style", wt.UINT), ("lpfnWndProc", WNDPROC), ("cbClsExtra", ctypes.c_int),
                ("cbWndExtra", ctypes.c_int), ("hInstance", wt.HINSTANCE), ("hIcon", wt.HICON),
                ("hCursor", wt.HANDLE), ("hbrBackground", wt.HBRUSH), ("lpszMenuName", wt.LPCWSTR),
                ("lpszClassName", wt.LPCWSTR)]


class NOTIFYICONDATAW(ctypes.Structure):
    _fields_ = [("cbSize", wt.DWORD), ("hWnd", wt.HWND), ("uID", wt.UINT), ("uFlags", wt.UINT),
                ("uCallbackMessage", wt.UINT), ("hIcon", wt.HICON), ("szTip", wt.WCHAR * 128),
                ("dwState", wt.DWORD), ("dwStateMask", wt.DWORD), ("szInfo", wt.WCHAR * 256),
                ("uVersion", wt.UINT), ("szInfoTitle", wt.WCHAR * 64), ("dwInfoFlags", wt.DWORD),
                ("guidItem", ctypes.c_byte * 16), ("hBalloonIcon", wt.HICON)]


user32.DefWindowProcW.argtypes = [wt.HWND, wt.UINT, wt.WPARAM, wt.LPARAM]
user32.DefWindowProcW.restype = LRESULT
user32.RegisterClassW.argtypes = [ctypes.POINTER(WNDCLASSW)]
user32.RegisterClassW.restype = wt.ATOM
user32.CreateWindowExW.argtypes = [wt.DWORD, wt.LPCWSTR, wt.LPCWSTR, wt.DWORD, ctypes.c_int, ctypes.c_int,
                                   ctypes.c_int, ctypes.c_int, wt.HWND, wt.HMENU, wt.HINSTANCE, wt.LPVOID]
user32.CreateWindowExW.restype = wt.HWND
user32.DestroyWindow.argtypes = [wt.HWND]
user32.LoadImageW.argtypes = [wt.HINSTANCE, wt.LPCWSTR, wt.UINT, ctypes.c_int, ctypes.c_int, wt.UINT]
user32.LoadImageW.restype = wt.HANDLE
user32.CreatePopupMenu.restype = wt.HMENU
user32.AppendMenuW.argtypes = [wt.HMENU, wt.UINT, ctypes.c_size_t, wt.LPCWSTR]
user32.SetMenuDefaultItem.argtypes = [wt.HMENU, wt.UINT, wt.UINT]
user32.TrackPopupMenu.argtypes = [wt.HMENU, wt.UINT, ctypes.c_int, ctypes.c_int, ctypes.c_int, wt.HWND, wt.LPVOID]
user32.TrackPopupMenu.restype = ctypes.c_int
user32.DestroyMenu.argtypes = [wt.HMENU]
user32.GetCursorPos.argtypes = [ctypes.POINTER(wt.POINT)]
user32.SetForegroundWindow.argtypes = [wt.HWND]
user32.PostMessageW.argtypes = [wt.HWND, wt.UINT, wt.WPARAM, wt.LPARAM]
user32.GetMessageW.argtypes = [ctypes.POINTER(wt.MSG), wt.HWND, wt.UINT, wt.UINT]
user32.GetMessageW.restype = wt.BOOL
user32.TranslateMessage.argtypes = [ctypes.POINTER(wt.MSG)]
user32.DispatchMessageW.argtypes = [ctypes.POINTER(wt.MSG)]
user32.DispatchMessageW.restype = LRESULT
user32.PostQuitMessage.argtypes = [ctypes.c_int]
user32.RegisterWindowMessageW.argtypes = [wt.LPCWSTR]
user32.RegisterWindowMessageW.restype = wt.UINT
user32.MessageBoxW.argtypes = [wt.HWND, wt.LPCWSTR, wt.LPCWSTR, wt.UINT]
user32.GetSystemMetrics.argtypes = [ctypes.c_int]
shell32.Shell_NotifyIconW.argtypes = [wt.DWORD, ctypes.POINTER(NOTIFYICONDATAW)]
shell32.Shell_NotifyIconW.restype = wt.BOOL
kernel32.GetModuleHandleW.argtypes = [wt.LPCWSTR]
kernel32.GetModuleHandleW.restype = wt.HMODULE

WM_DESTROY, WM_COMMAND, WM_APP = 0x0002, 0x0111, 0x8000
WM_LBUTTONUP, WM_RBUTTONUP = 0x0202, 0x0205
CALLBACK = WM_APP + 1
NIM_ADD, NIM_MODIFY, NIM_DELETE = 0, 1, 2
NIF_MESSAGE, NIF_ICON, NIF_TIP, NIF_INFO = 0x1, 0x2, 0x4, 0x10
MF_SEPARATOR, MF_GRAYED, MF_CHECKED = 0x800, 0x1, 0x8
TPM_RIGHTBUTTON, TPM_RETURNCMD, TPM_NONOTIFY, TPM_BOTTOMALIGN = 0x2, 0x100, 0x80, 0x20

(CMD_OPEN, CMD_RESTART, CMD_REFRESH, CMD_LOG, CMD_FOLDER, CMD_AUTOSTART, CMD_EXIT,
 CMD_DESKTOP, CMD_STARTMENU) = range(1, 10)
WINDOW_CLASS = "GuraydingviewTray"


class Tray:
    def __init__(self):
        self.url = f"http://{server.HOST}:{server.PORT}/"
        self.srv = None
        self.tip = APP
        self.taskbar_created = None  # messages arrive while the window is being created: define first
        self._wndproc = WNDPROC(self._proc)  # keep a reference so it isn't garbage collected
        hinst = kernel32.GetModuleHandleW(None)
        wc = WNDCLASSW()
        wc.lpfnWndProc = self._wndproc
        wc.hInstance = hinst
        wc.lpszClassName = WINDOW_CLASS
        user32.RegisterClassW(ctypes.byref(wc))
        self.hwnd = user32.CreateWindowExW(0, WINDOW_CLASS, APP, 0, 0, 0, 0, 0, None, None, hinst, None)
        if not self.hwnd:
            raise OSError(f"Could not create the tray window (error {ctypes.get_last_error()})")
        self.taskbar_created = user32.RegisterWindowMessageW("TaskbarCreated")
        sx, sy = user32.GetSystemMetrics(49), user32.GetSystemMetrics(50)  # small icon size (DPI aware)
        self.hicon = user32.LoadImageW(None, ICON_FILE, 1, sx, sy, 0x10)
        self._icon(NIM_ADD, tip=f"{APP} — starting…")

    # ---- tray icon
    def _nid(self):
        nid = NOTIFYICONDATAW()
        nid.cbSize = ctypes.sizeof(NOTIFYICONDATAW)
        nid.hWnd = self.hwnd
        nid.uID = 1
        return nid

    def _icon(self, op, tip=None):
        nid = self._nid()
        if op != NIM_DELETE:
            nid.uFlags = NIF_MESSAGE | NIF_ICON | NIF_TIP
            nid.uCallbackMessage = CALLBACK
            nid.hIcon = self.hicon
            nid.szTip = (tip or self.tip)[:127]
        if tip:
            self.tip = tip
        shell32.Shell_NotifyIconW(op, ctypes.byref(nid))

    def notify(self, title, text):
        nid = self._nid()
        nid.uFlags = NIF_INFO
        nid.szInfoTitle = title[:63]
        nid.szInfo = text[:255]
        nid.dwInfoFlags = 0x1  # NIIF_INFO
        shell32.Shell_NotifyIconW(NIM_MODIFY, ctypes.byref(nid))

    # ---- server
    def start_server(self):
        for _ in range(30):  # after a restart, wait until the old process releases the port
            try:
                self.srv = server.QuietServer((server.HOST, server.PORT), server.Handler)
                break
            except OSError:
                time.sleep(0.2)
        else:
            return False
        threading.Thread(target=self.srv.serve_forever, daemon=True).start()
        print(f"Server running: {self.url}")
        self._icon(NIM_MODIFY, tip=f"{APP} — running ({server.HOST}:{server.PORT})")
        return True

    def stop_server(self):
        if self.srv:
            self.srv.shutdown()
            self.srv.server_close()
            self.srv = None
            print("Server stopped")

    # ---- menu commands
    def open(self):
        webbrowser.open(self.url)

    def restart(self):
        print("Restarting…")
        self.stop_server()
        self._icon(NIM_DELETE)
        subprocess.Popen([pythonw_exe(), os.path.join(ROOT, "tray.py"), "--no-open", "--restarted"],
                         cwd=ROOT, creationflags=0x00000008 | 0x00000200, close_fds=True)
        user32.DestroyWindow(self.hwnd)

    def refresh(self):
        with server._cache_lock:
            server._cache.clear()
        self.notify(APP, "Cache cleared — data will be fetched from the sources again.")

    def menu(self):
        m = user32.CreatePopupMenu()
        items = [
            (0, f"{APP} — {'running' if self.srv else 'stopped'} ({server.HOST}:{server.PORT})", MF_GRAYED),
            (0, None, MF_SEPARATOR),
            (CMD_OPEN, f"Open {APP}", 0),
            (CMD_RESTART, "Restart server", 0),
            (CMD_REFRESH, "Refresh data (clear cache)", 0),
            (0, None, MF_SEPARATOR),
            (CMD_LOG, "Open log file", 0),
            (CMD_FOLDER, "Open folder", 0),
            (CMD_DESKTOP, "Create desktop shortcut", 0),
            (CMD_STARTMENU, "Add to Start menu", MF_CHECKED if os.path.exists(START_MENU_LNK) else 0),
            (CMD_AUTOSTART, "Start with Windows", MF_CHECKED if autostart_enabled() else 0),
            (0, None, MF_SEPARATOR),
            (CMD_EXIT, "Exit", 0),
        ]
        for cid, text, flags in items:
            user32.AppendMenuW(m, flags, cid, text)
        user32.SetMenuDefaultItem(m, CMD_OPEN, 0)
        pt = wt.POINT()
        user32.GetCursorPos(ctypes.byref(pt))
        user32.SetForegroundWindow(self.hwnd)  # so the menu closes when clicking elsewhere
        cmd = user32.TrackPopupMenu(m, TPM_RIGHTBUTTON | TPM_RETURNCMD | TPM_NONOTIFY | TPM_BOTTOMALIGN,
                                    pt.x, pt.y, 0, self.hwnd, None)
        user32.PostMessageW(self.hwnd, 0, 0, 0)
        user32.DestroyMenu(m)
        self.run(cmd)

    def run(self, cmd):
        try:
            if cmd == CMD_OPEN:
                self.open()
            elif cmd == CMD_RESTART:
                self.restart()
            elif cmd == CMD_REFRESH:
                self.refresh()
            elif cmd == CMD_LOG:
                os.startfile(LOG_FILE)
            elif cmd == CMD_FOLDER:
                os.startfile(ROOT)
            elif cmd == CMD_DESKTOP:
                create_shortcut(os.path.join(desktop_dir(), APP + ".lnk"))
                self.notify(APP, "Desktop shortcut created.")
            elif cmd == CMD_STARTMENU:
                if os.path.exists(START_MENU_LNK):
                    os.remove(START_MENU_LNK)
                    self.notify(APP, "Removed from the Start menu.")
                else:
                    create_shortcut(START_MENU_LNK)
                    self.notify(APP, "Added to the Start menu.")
            elif cmd == CMD_AUTOSTART:
                on = not autostart_enabled()
                set_autostart(on)
                self.notify(APP, "Will start with Windows." if on else "Will no longer start with Windows.")
            elif cmd == CMD_EXIT:
                print("Exit")
                self.stop_server()
                user32.DestroyWindow(self.hwnd)
        except Exception as e:
            print(f"Menu command failed: {e!r}")

    def _proc(self, hwnd, msg, wparam, lparam):
        try:
            return self._handle(hwnd, msg, wparam, lparam)
        except Exception as e:  # an error in the callback must not break the window
            print(f"Window message error ({msg}): {e!r}")
            return user32.DefWindowProcW(hwnd, msg, wparam, lparam)

    def _handle(self, hwnd, msg, wparam, lparam):
        if msg == WM_COMMAND:  # menu commands also work as window messages
            self.run((wparam or 0) & 0xFFFF)
            return 0
        if msg == CALLBACK:
            ev = (lparam or 0) & 0xFFFF
            if ev == WM_RBUTTONUP:
                self.menu()
            elif ev == WM_LBUTTONUP:
                self.open()
            return 0
        if msg == self.taskbar_created and msg:  # Explorer restarted: put the icon back
            self._icon(NIM_ADD)
            return 0
        if msg == WM_DESTROY:
            self._icon(NIM_DELETE)
            user32.PostQuitMessage(0)
            return 0
        return user32.DefWindowProcW(hwnd, msg, wparam, lparam)

    def loop(self):
        msg = wt.MSG()
        while user32.GetMessageW(ctypes.byref(msg), None, 0, 0) > 0:
            user32.TranslateMessage(ctypes.byref(msg))
            user32.DispatchMessageW(ctypes.byref(msg))


def main():
    args = sys.argv[1:]
    try:
        ctypes.windll.shcore.SetProcessDpiAwareness(2)  # crisp menu on high-DPI screens
    except Exception:
        pass
    ensure_icon()
    if not os.path.exists(FOLDER_LNK):  # an icon launcher next to Start.bat
        try:
            create_shortcut(FOLDER_LNK)
        except Exception as e:
            print(f"Could not create the shortcut: {e!r}")
    if os.path.exists(LEGACY_VBS):  # migrate "start with Windows" from the old name
        set_autostart(True)
    os.makedirs(server.CSV_DIR, exist_ok=True)
    if os.path.exists(server.DRAWINGS_FILE) and "--restarted" not in args:  # back up drawings on every start
        shutil.copyfile(server.DRAWINGS_FILE, os.path.join(DATA_DIR, "drawings.backup.json"))
    tray = Tray()
    if not tray.start_server():
        tray._icon(NIM_DELETE)
        user32.MessageBoxW(None, f"Port {server.PORT} is in use — {APP} may already be running.\n"
                                 "If an old console window is open, close it and try again.\n\n"
                                 "Opening the running instance in the browser.", APP, 0x40)
        webbrowser.open(tray.url)
        return
    if "--no-open" not in args:
        tray.open()
    if "--quiet" not in args and "--restarted" not in args:
        tray.notify(f"{APP} is running", "Click the icon to open · right-click for the menu (restart, exit…)")
    elif "--restarted" in args:
        tray.notify(APP, "Server restarted.")
    tray.loop()
    tray.stop_server()


if __name__ == "__main__":
    main()
