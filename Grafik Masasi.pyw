# Çift tıkla: Grafik Masası'nı konsol penceresi olmadan, saatin yanındaki simgeyle başlatır.
import os
import runpy

runpy.run_path(os.path.join(os.path.dirname(os.path.abspath(__file__)), "tray.py"), run_name="__main__")
