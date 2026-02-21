#!/bin/sh
set -e

# Apply migrations on the mounted database
echo "Applying database migrations..."
flask db upgrade

# Start the main process
exec "$@"