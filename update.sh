#!/usr/bin/env bash
#
# Updates an already installed plugin in the surrounding CrafterCMS site: copies both tiers, commits
# the authoring tier in the site's sandbox repository and rebuilds Studio's Groovy engine, so a
# change takes effect in a running Crafter.
#
# It transports only. Building the frontend bundle is a separate step that runs in the webtools
# container, see README.md. Wiring is a separate step too: whenever the installation block of the
# descriptor changes, the plugin has to be installed again through the Extended Plugin Manager or the
# Crafter CLI. Going that way is skipped here on purpose, because the copy stays out of the
# publishing queue.

set -euo pipefail

plugin_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
site_dir="$(cd "$plugin_dir/../.." && pwd)"

fail() {
  echo "update: $*" >&2
  exit 1
}

for tool in rsync curl git; do
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

authoring_target="$site_dir/config/studio"
authoring_folders=(content-types scripts static-assets)

copy_tier authoring "$authoring_target" "${authoring_folders[@]}"
copy_tier delivery "$site_dir" scripts static-assets templates

# Studio reads a file through its content repository, and that takes the blob from the last commit of
# the sandbox repository, not from the working tree (GitContentRepository.getContentFromGit via
# getTreeForLastCommit). A copied file therefore stays invisible to Studio until it is committed, and
# no endpoint can help, because it is the source and not a cache that is stale. Only the authoring
# tier needs this: Engine runs with crafter.engine.store.type=filesystem and reads the delivery tier
# straight from the working tree. Groovy under scripts/ would work uncommitted as well, it goes along
# so that a later checkout in the site repository cannot silently drop it.
#
# Only the authoring folders are staged, so unrelated work in the site's working tree stays
# untouched. The pathspec on commit keeps anything else that was already staged out of this commit.
commit_paths=()
for folder in "${authoring_folders[@]}"; do
  [ -d "$authoring_target/$folder" ] && commit_paths+=("$authoring_target/$folder")
done

commit_note="nothing to commit"
if [ ${#commit_paths[@]} -gt 0 ]; then
  git -C "$site_dir" rev-parse --git-dir >/dev/null 2>&1 ||
    fail "$site_dir is not a git repository, so Studio cannot be given a commit to read the copy from."
  git -C "$site_dir" add -- "${commit_paths[@]}"
  if ! git -C "$site_dir" diff --cached --quiet -- "${commit_paths[@]}"; then
    git -C "$site_dir" commit --quiet --message "Update plugin $plugin_id (direct copy)" \
      -- "${commit_paths[@]}"
    commit_note="committed"
  fi
fi

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

echo "update: $plugin_id is in $CRAFTER_SITE_ID, $commit_note, reload ok."
