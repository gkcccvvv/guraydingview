# Double-click: starts Guraydingview without a console window, with an icon next to the clock.
import os
import runpy

runpy.run_path(os.path.join(os.path.dirname(os.path.abspath(__file__)), "tray.py"), run_name="__main__")
