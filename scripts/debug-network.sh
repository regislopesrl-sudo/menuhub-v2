#!/bin/bash
set -e

log(){ printf "[%s] %s\n" "$(date -u +'%Y-%m-%dT%H:%M:%SZ')" "$*"; }

log "hostname: $(hostname)"
log "user: $(whoami)"
log "pwd: $(pwd)"
log "--- DNS resolution ---"
dig github.com +short || true
nslookup github.com || true

log "--- DNS via Google ---"
dig @8.8.8.8 github.com +short || true

log "--- traceroute github.com ---"
command -v traceroute >/dev/null && traceroute github.com || tracepath github.com || true

log "--- curl github.com ---"
curl -I https://github.com || true

log "--- ping github.com (5x) ---"
ping -c 5 github.com || true

log "--- iptables filter ---"
sudo iptables -L -n || true
log "--- ufw status ---"
sudo ufw status || true
