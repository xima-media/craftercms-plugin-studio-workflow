#!/usr/bin/env bash
#
# Updates an already installed plugin in the surrounding CrafterCMS site: copies both tiers and
# rebuilds Studio's Groovy engine, so a change takes effect in a running Crafter.
#
# It transports only. Building the frontend bundle is a separate step that runs in the webtools
# container, see README.md. Wiring is a separate step too: whenever the installation block of the
# descriptor changes, the plugin has to be installed again through the Extended Plugin Manager or the
# Crafter CLI. Going that way is skipped here on purpose, because copying causes neither a commit nor
# an entry in the publishing queue.

set -euo pipefail

plugin_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
site_dir="$(cd "$plugin_dir/../.." && pwd)"

fail() {
  echo "update: $*" >&2
  exit 1
}

for tool in rsync curl; do
  command -v "$tool" >/dev/null || fail "$tool is missing. On Debian or Ubuntu install it with:
sudo apt install $tool"
done

# The plugin finds everything it needs relative to itself, so it must first make sure it is really
# sitting in a CrafterCMS site and not somewhere else.
if [ ! -d "$site_dir/config/studio" ] || [ ! -d "$site_dir/config/engine" ]; then
  fail "$site_dir does not look like a CrafterCMS site. Expected the plugin at <site>/plugins/<plugin>/."
fi

if [ ! -f "$site_dir/.env" ]; then
  fail "no .env in $site_dir. Create it from the template and fill it in:
cp $site_dir/.env.example $site_dir/.env"
fi

set -a
# shellcheck disable=SC1091
. "$site_dir/.env"
set +a

: "${CRAFTER_BASE_URL:?update: CRAFTER_BASE_URL is not set in $site_dir/.env}"
: "${CRAFTER_SITE_ID:?update: CRAFTER_SITE_ID is not set in $site_dir/.env}"

cd "$plugin_dir"

plugin_id="$(sed -n 's/^  id:[[:space:]]*\([^[:space:]]*\).*$/\1/p' craftercms-plugin.yaml | head -1)"

# Both trees are merged at their own relative paths, authoring below config/studio, delivery at the
# site root. Only the folders named per tier are transported, the ones Crafter reads at that place.
# Anything else a plugin keeps in its tier is a template for the installation, not configuration, and
# copying it would leave inert clutter in the site. The .keep files only exist to carry the empty
# folders through git.
copy_tier() {
  local source="$1" target="$2"
  shift 2
  local folder
  for folder in "$@"; do
    [ -d "$source/$folder" ] || continue
    rsync --archive --prune-empty-dirs --exclude='.keep' "$source/$folder/" "$target/$folder/"
  done
}

copy_tier authoring "$site_dir/config/studio" content-types scripts static-assets
copy_tier delivery "$site_dir" scripts static-assets templates

# Studio caches compiled Groovy classes per site and does not notice a changed one on its own. The
# token is Studio's own shipped default for studio.configuration.management.authorizationToken.
reload_status="$(curl --silent --output /dev/null --write-out '%{http_code}' \
  "$CRAFTER_BASE_URL/studio/api/2/plugin/script/reload?siteId=$CRAFTER_SITE_ID&token=defaultManagementToken")"

if [ "$reload_status" = "401" ]; then
  fail "script reload was refused. This Crafter runs with a management token of its own, set through
STUDIO_MANAGEMENT_TOKEN in the container, so the default this script uses no longer fits."
elif [ "$reload_status" != "200" ]; then
  fail "script reload answered $reload_status. See knowledge/INSTALLATION.md of the site."
fi

echo "update: $plugin_id is in $CRAFTER_SITE_ID, reload ok."
