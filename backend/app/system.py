"""Métricas da máquina do backend, sem nomes de usuário, processos ou arquivos."""
import threading
import time
from datetime import datetime, timezone

import psutil


class SystemMonitor:
    def __init__(self):
        self.lock = threading.Lock()
        self.cpu = psutil.cpu_times()
        self.net = psutil.net_io_counters()
        self.at = time.monotonic()
        self.cached = None

    @staticmethod
    def cpu_totals(value):
        total = sum(value) - getattr(value, "guest", 0) - getattr(value, "guest_nice", 0)
        idle = value.idle + getattr(value, "iowait", 0)
        return total, idle

    def sample(self):
        with self.lock:
            stamp = time.monotonic()
            elapsed = stamp - self.at
            if self.cached and elapsed < 1:
                return self.cached
            cpu, net, memory = psutil.cpu_times(), psutil.net_io_counters(), psutil.virtual_memory()
            cpu_percent = down = up = None
            if elapsed >= 1:
                previous, previous_idle = self.cpu_totals(self.cpu)
                total, idle = self.cpu_totals(cpu)
                if total > previous:
                    cpu_percent = round(max(0, min(100, (1 - (idle - previous_idle) / (total - previous)) * 100)), 1)
                if net and self.net:
                    down = round(max(0, (net.bytes_recv - self.net.bytes_recv) / elapsed), 1)
                    up = round(max(0, (net.bytes_sent - self.net.bytes_sent) / elapsed), 1)
                self.cpu, self.net, self.at = cpu, net, stamp
            self.cached = {"cpu_percent": cpu_percent, "memory_percent": memory.percent,
                           "download_bps": down, "upload_bps": up,
                           "sampled_at": datetime.now(timezone.utc).isoformat()}
            return self.cached
