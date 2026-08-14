import sys, socket, json, urllib.request, time
from http.server import HTTPServer, BaseHTTPRequestHandler
from concurrent.futures import ThreadPoolExecutor


class TVDiscovery():
    def __init__(self):
        pass
        
    def _get_subnet(self):
        """Detect the subnet of the local network by creating a UDP socket and connecting to a public DNS server"""
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        try:
            s.connect(("8.8.8.8", 80))
            return ".".join(s.getsockname()[0].split(".")[:3])
        except Exception:
            return None
        finally:
            s.close()

    def _check_ip(self, ip):
        try:
            url = f"http://{ip}:8001/api/v2/"
            req = urllib.request.Request(url, headers={'User-Agent': 'FrameScanner'})
            with urllib.request.urlopen(req, timeout=0.8) as resp:
                if resp.status == 200:
                    d = json.loads(resp.read().decode('utf-8')).get('device', {})
                    if 'Samsung' in d.get('type', '') or 'FRAME' in d.get('model', '').upper():
                        return {
                            'ip': ip,
                            'name': d.get('name', 'Samsung TV').replace('&quot;', '"'),
                            'model': d.get('modelName') or d.get('model', 'N/A'),
                            'mac': d.get('wifiMac') or d.get('mac', 'N/A'),
                            'is_frame': d.get('FrameTVSupport') == 'true' or 'FRAME' in d.get('model', '').upper()
                        }
        except Exception:
            pass
        return None

    def scan_network(self):
        """Scan the local network for Samsung TVs by checking each IP in the subnet"""
        subnet = self._get_subnet()
        if not subnet: return []
        ips = [f"{subnet}.{i}" for i in range(1, 255)]
        with ThreadPoolExecutor(max_workers=60) as exec:
            return [res for res in exec.map(self._check_ip, ips) if res]


    def run_cli(self):
        print("🔍 Scan subnet...")
        start = time.time()
        tvs = self.scan_network()
        print(f"⏱️ Done in {round(time.time() - start, 2)}s\n")
        print(json.dumps(tvs, indent=2) if tvs else "❌ Kein TV gefunden.")

if __name__ == "__main__":
    tv_discovery = TVDiscovery()
    tv_discovery.run_cli()