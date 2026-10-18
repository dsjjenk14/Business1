#!/usr/bin/env bash
# Adds a player account to the LIVERA server (registration is closed on the VPS).
#
#   sudo livera-add-player USERNAME        (installed by setup.sh; or run this file directly)
#
# Asks for the password twice (it is never shown or stored anywhere but as a salted hash in the
# database), then runs: livera_server --db /var/lib/livera/world.db --add-account USERNAME
# Safe while the server is running. The new player logs in at https://<your site> and picks a character.
set -euo pipefail

DB=${LIVERA_DB:-/var/lib/livera/world.db}
SERVER=${LIVERA_SERVER_BIN:-/opt/livera/current/bin/livera_server}

die() {
  echo "add_player: $*" >&2
  exit 1
}

[[ $# -eq 1 ]] || die "usage: $0 USERNAME   (3-24 characters: lowercase letters, digits, _)"
user=$1
[[ $EUID -eq 0 ]] || die "run it as root (sudo $0 $user)"
[[ "$user" =~ ^[a-z0-9_]{3,24}$ ]] || die "a username is 3-24 characters: lowercase letters, digits and _"
if [[ "$user" == bot_* ]]; then die "names starting with bot_ are for the town director's scripts"; fi
[[ -x "$SERVER" ]] || die "no server at $SERVER: has setup.sh finished?"
id livera >/dev/null 2>&1 || die "no livera user: has setup.sh finished?"

# Read from the terminal even if stdin is a pipe.
exec 3</dev/tty || die "needs a terminal to ask for the password"
read -r -s -p "Password for $user (8-128 characters): " pass1 <&3
echo
read -r -s -p "Same password again: " pass2 <&3
echo
exec 3<&-
[[ "$pass1" == "$pass2" ]] || die "the two passwords are different; nothing changed"
[[ ${#pass1} -ge 8 && ${#pass1} -le 128 ]] || die "the password must be 8-128 characters; nothing changed"

if printf '%s\n' "$pass1" | runuser -u livera -- "$SERVER" --db "$DB" --add-account "$user"; then
  echo "Done. $user can log in now."
else
  die "the server refused (see the message above); nothing changed"
fi
