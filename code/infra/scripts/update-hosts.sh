#!/bin/bash
# Usage: ./update-hosts.sh add my-app
#        ./update-hosts.sh remove my-app
# Windows users: run from an elevated PowerShell instead:
#   Add-Content C:\Windows\System32\drivers\etc\hosts "127.0.0.1  $slug.silo.local"

ACTION=$1
SLUG=$2
HOSTS="/etc/hosts"
ENTRY="127.0.0.1  ${SLUG}.silo.local"

if [ "$ACTION" = "add" ]; then
    grep -qF "$ENTRY" "$HOSTS" || echo "$ENTRY" | sudo tee -a "$HOSTS"
    echo "Added: $ENTRY"
elif [ "$ACTION" = "remove" ]; then
    sudo sed -i "/$SLUG\.silo\.local/d" "$HOSTS"
    echo "Removed: $SLUG.silo.local"
else
    echo "Usage: $0 {add|remove} <slug>"
    exit 1
fi
