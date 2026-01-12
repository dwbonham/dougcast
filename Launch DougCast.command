#!/bin/bash
# DougCast Desktop Launcher
# Double-click this file to launch DougCast in your browser

cd "$(dirname "$0")"

# Start a local server and open the browser
echo "Starting DougCast..."
echo "Opening in your default browser..."
echo ""
echo "Press Ctrl+C to stop the server when done."
echo ""

# Open browser after a short delay to let server start
(sleep 1 && open "http://localhost:8080") &

# Start Python HTTP server
python3 -m http.server 8080
