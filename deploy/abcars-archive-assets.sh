#!/bin/bash
# Keep hashed files from both sides of a publication for tabs opened earlier.
set -euo pipefail
cd /srv/abcars

mkdir -p asset-archive/assets
for source in dist.prev/client/assets dist/client/assets; do
  if [ -d "$source" ]; then
    cp -an "$source"/. asset-archive/assets/
  fi
done

cur=$(ls -t dist/client/assets/index-*.css 2>/dev/null | head -1 || true)
if [ -n "$cur" ]; then
  cp -f "$cur" asset-archive/assets/latest-style.css
  if [ -f "$cur.br" ]; then
    cp -f "$cur.br" asset-archive/assets/latest-style.css.br
  fi
fi
find asset-archive/assets -type f -mtime +90 ! -name "latest-style.css*" -delete
