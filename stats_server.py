#!/usr/bin/env python3
"""Minimal HTTP stats server for YeQu Main Page."""

import json
import os
import subprocess
import time
from http.server import HTTPServer, BaseHTTPRequestHandler

HOST = "127.0.0.1"
PORT = 9999
CACHE_TTL = 2.0  # seconds
_cache = {"ts": 0}


def get_cpu_percent():
    """Read /proc/stat and compute CPU usage since last call."""
    with open("/proc/stat") as f:
        fields = f.readline().split()
    return [int(x) for x in fields[1:9]]


def get_docker_ps():
    """Return list of docker containers with name, image, status, uptime."""
    try:
        out = subprocess.check_output(
            [
                "docker", "ps", "--format",
                "{{.Names}}|{{.Image}}|{{.Status}}|{{.RunningFor}}",
            ],
            timeout=5,
        ).decode().strip()
        if not out:
            return []
        containers = []
        for line in out.split("\n"):
            parts = line.split("|")
            containers.append(
                {
                    "name": parts[0],
                    "image": parts[1],
                    "status": parts[2],
                    "runningFor": parts[3] if len(parts) > 3 else "",
                }
            )
        return containers
    except Exception:
        return []


def collect():
    """Collect all stats into a dict."""
    # CPU
    cpu_now = get_cpu_percent()
    global _cpu_prev
    if "_cpu_prev" not in collect.__dict__:
        collect.cpu_prev = cpu_now
        time.sleep(0.5)
        cpu_now = get_cpu_percent()
        collect.cpu_prev = cpu_now

    total = sum(cpu_now) - sum(collect.cpu_prev)
    idle = cpu_now[3] - collect.cpu_prev[3]
    cpu_pct = round((total - idle) / total * 100, 1) if total > 0 else 0
    collect.cpu_prev = cpu_now

    # Memory
    with open("/proc/meminfo") as f:
        mem = {}
        for line in f:
            if "MemTotal" in line or "MemAvailable" in line:
                k, v, *_ = line.split()
                mem[k.rstrip(":")] = int(v)
    mem_total_mb = mem["MemTotal"] // 1024
    mem_used_mb = (mem["MemTotal"] - mem["MemAvailable"]) // 1024
    mem_pct = round(mem_used_mb / mem_total_mb * 100, 1)

    # Disk
    stat = os.statvfs("/")
    disk_total = stat.f_frsize * stat.f_blocks
    disk_avail = stat.f_frsize * stat.f_bavail
    disk_used = disk_total - disk_avail
    disk_pct = round(disk_used / disk_total * 100, 1)

    def fmt_gb(b):
        return round(b / (1024**3), 1)

    # Load
    with open("/proc/loadavg") as f:
        la = f.readline().split()[:3]

    # Uptime
    with open("/proc/uptime") as f:
        up_sec = int(float(f.readline().split()[0]))

    # Docker
    docker = get_docker_ps()

    return {
        "cpu": cpu_pct,
        "cpuCores": os.cpu_count(),
        "memUsed": mem_used_mb,
        "memTotal": mem_total_mb,
        "memPct": mem_pct,
        "diskUsed": fmt_gb(disk_used),
        "diskTotal": fmt_gb(disk_total),
        "diskPct": disk_pct,
        "load": [float(x) for x in la],
        "uptime": up_sec,
        "docker": docker,
    }


class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        if self.path != "/stats":
            self.send_response(404)
            self.end_headers()
            return
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Cache-Control", "no-cache")
        self.end_headers()
        self.wfile.write(json.dumps(collect()).encode())

    def log_message(self, format, *args):
        pass  # silent


if __name__ == "__main__":
    server = HTTPServer((HOST, PORT), Handler)
    print(f"stats server on {HOST}:{PORT}")
    server.serve_forever()
