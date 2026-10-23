# Putting LIVÉRA online

This puts the game on a small rented server so you and a few invited friends can play from your
phones at your own web address. You will copy one command into the server once. Everything here
works from a phone browser.

**Honest status:** these scripts have been checked carefully (see the end of this page) but have not
yet been run on a real rented server. The first install is the real test. If anything stops, the
script says which step and what to do, and it is safe to run it again.

---

## 1. What it costs

| Thing | Monthly | Notes |
|---|---|---|
| A server (VPS) | about $5 to $12 | see step 2 |
| A domain name (optional) | about $1 (paid yearly, $10 to $15) | you can skip it and use a free address |
| HTTPS certificate | free | done for you (Let's Encrypt, through Caddy) |
| **Total** | **about $5 to $13** | |

Nothing else is needed: no app store accounts, no other subscriptions.

## 2. Rent a server

Pick **Ubuntu 24.04 LTS** as the operating system and **at least 2 GB of memory (RAM)**. The game
builds itself on the server, and the build needs about 2 GB; on a 2 GB server the setup adds a
2 GB swap file automatically so it doesn't run out.

Good choices (prices checked on 18 October 2026 from public price lists; the providers' own pages
couldn't be opened from here, so look at the price on the order page before you pay):

| Provider | Plan | Memory | About | Good for |
|---|---|---|---|---|
| **Hetzner Cloud** | CX23 (replaced the CX22) | 4 GB, 2 CPUs, 40 GB | €5.49/month + VAT in its EU locations, plus a small charge for the public IPv4 address; its US locations cost more | cheapest sensible choice; fine from the US with a little more lag |
| **Vultr** | Cloud Compute, Regular, 2 GB | 2 GB, 1 CPU, 55 GB | $10/month | US locations close to you |
| **DigitalOcean** | Basic Droplet, 2 GB | 2 GB, 1 CPU, 50 GB | $12/month | very easy dashboard |

If you're not sure: **Hetzner CX23** is the best value (twice the memory of the others). If you
and your friends are all in the US and want the lowest lag, take **Vultr 2 GB** in the city closest
to you.

When you create the server:
1. Choose **Ubuntu 24.04**.
2. Choose the plan above.
3. For login, the provider either emails you a root password or asks for an "SSH key". A password is
   fine to start with.
4. Write down the server's **IPv4 address** (four numbers, like `203.0.113.7`).

**How to type commands from your phone:** every provider has a browser console. Open your server in
the provider's dashboard and press **Console** (Hetzner: the `>_` button; DigitalOcean: "Access" →
"Launch Droplet Console"; Vultr: "View Console"). Log in as `root`. You can also use a free SSH app
such as Termius.

## 3. A web address (optional)

**Without a domain:** skip this. Your game will be at an address made from your server's IP, like
`https://203-0-113-7.sslip.io`. It works right away and has real HTTPS.

**With a domain** (e.g. `play.yourname.com`):
1. Buy a domain at any registrar (Cloudflare, Porkbun, Namecheap...).
2. In the domain's **DNS** settings, add an **A record**:
   - Name: `play` (or `@` for the bare domain)
   - Value / points to: your server's IPv4 address
   - If you use Cloudflare, set it to **DNS only** (grey cloud), not proxied.
3. Wait 5 to 30 minutes for it to take effect.

## 4. Install: the one command

In the server console, paste **one** of these (all on one line) and press Enter.

With a domain (put in your own domain and email):

```
curl -fsSL https://raw.githubusercontent.com/dsjjenk14/Business1/claude/livera-foundation-g8w2cv/livera/deploy/setup.sh | bash -s -- --domain play.yourname.com --email you@example.com
```

Without a domain:

```
curl -fsSL https://raw.githubusercontent.com/dsjjenk14/Business1/claude/livera-foundation-g8w2cv/livera/deploy/setup.sh | bash
```

It takes **10 to 25 minutes** (most of it is building the game). Leave the console open. At the
end it prints your address, for example:

```
LIVERA is installed (commit 1a2b3c4d5e6f).
  Open:           https://play.yourname.com
```

The very first visit can take a minute while the HTTPS certificate is fetched.

(Once the work is merged into the main branch, replace `claude/livera-foundation-g8w2cv` in the
address with `main` and add `--branch main`.)

## 5. Make your account, then your friends'

Registration is closed: only you can create accounts. In the server console:

```
livera-add-player yourname
```

It asks for a password twice (nothing shows while you type; that's normal). Usernames are 3 to 24
lowercase letters, digits or `_`. Do the same for each friend, then send them the address, their
username and their password. Up to **16 people** can be in the world at once.

## 6. Playing

Open the address on your phone. Log in, then pick one of the founding characters or make your own.

The founders nobody has picked are **played by a script** (the "town director") so the town isn't
empty. They walk to work, take the bus, buy coffee and go home at night. They are always labelled
"played by a script", they never chat, and they say no to every ask. **People always win:** when
you pick a founder the script is playing, you take them over at once and the script lets go.

To turn the scripted founders off (see "Changing a setting" in step 9):

```
bash /opt/livera/current/deploy/setup.sh --skip-fetch --no-director
```

On again: the same command with `--director`. Updates remember the choice. Don't use
`systemctl disable livera-director` for this: the next update or install turns the founders back on.

## 7. Updating

```
livera-update
```

It downloads the newest version, backs up the database, builds, **runs all the tests**, and only
then switches to the new version (a few seconds of disconnection, after which everyone logs in
again with their password). If the tests fail, nothing changes and the old version keeps running.
Your world, accounts and characters are kept.

Ubuntu installs its own security updates automatically every day.

## 8. Backups

- Every night (around 04:17 UTC) the world is backed up to `/var/lib/livera/backups/`.
  The newest **14** are kept. A backup is also made before every update.
- Make one now: `sudo -u livera /opt/livera/current/deploy/backup.sh manual`
- **These backups are on the same server.** If the server is deleted, they go with it. Turn on
  your provider's backup option (usually +20% of the server price), or copy a file to your
  computer now and then: `scp root@YOUR-IP:/var/lib/livera/backups/world-*.db.gz .`

To restore a backup (this replaces the current world):

```
systemctl stop livera-gateway livera-server
gunzip -c /var/lib/livera/backups/world-YYYYMMDD-HHMMSS.db.gz > /var/lib/livera/world.db
rm -f /var/lib/livera/world.db-wal /var/lib/livera/world.db-shm
chown livera:livera /var/lib/livera/world.db
systemctl start livera-server livera-gateway
systemctl try-restart livera-director
```

(`try-restart` restarts the scripted founders only if they are on.)

## 9. Handy commands

| To... | Type |
|---|---|
| see if everything runs | `systemctl status livera-server livera-gateway livera-director caddy` |
| watch the logs | `journalctl -u livera-server -u livera-director -f` (Ctrl+C to stop) |
| restart the game | `systemctl restart livera-server livera-gateway && systemctl try-restart livera-director` |
| free a character someone claimed | `sudo -u livera /opt/livera/current/bin/livera_server --db /var/lib/livera/world.db --release-character dax` |
| change the player limit | `bash /opt/livera/current/deploy/setup.sh --skip-fetch --max-players 24` |
| move to your own domain later | add its A record (step 3), then `bash /opt/livera/current/deploy/setup.sh --skip-fetch --domain play.yourname.com --email you@example.com` |
| go back to the previous version | see "Going back to the previous version" below |

**Changing a setting:** run `bash /opt/livera/current/deploy/setup.sh --skip-fetch` with the
options you want to change (`--max-players`, `--domain`, `--email`, `--no-director`, `--director`;
`--help` lists them all). It doesn't fetch a new version of the game, keeps every setting you
leave out, and restarts the game if a setting changed, so players log in again. Running the
install command again with the same options does the same after fetching the newest version.

Running the install command again is always safe: it keeps your world, accounts and settings.

### Going back to the previous version

If an update went wrong, put the world back as it was just before that update and run the
older version again. **Anything played since that update is lost.**

```
readlink /opt/livera/current                  # the version running now
ls -t /opt/livera/releases                    # newest first: OLDER is the one before it
ls -t /var/lib/livera/backups/*-pre-update.db.gz | head -n 1   # the backup made just before that update
systemctl stop livera-gateway livera-server
gunzip -c /var/lib/livera/backups/world-YYYYMMDD-HHMMSS-pre-update.db.gz > /var/lib/livera/world.db
rm -f /var/lib/livera/world.db-wal /var/lib/livera/world.db-shm
chown livera:livera /var/lib/livera/world.db
ln -sfn /opt/livera/releases/OLDER /opt/livera/current
install -m 0644 /opt/livera/current/deploy/systemd/livera-* /etc/systemd/system/
systemctl daemon-reload
systemctl start livera-server livera-gateway
systemctl try-restart livera-director
```

The backup is restored even when the update looked harmless: an update may change the save
format, and an older version can't open a world saved by a newer one. If the log
(`journalctl -u livera-server -n 20`) says **"save was written by a newer server"**, that is what
happened, and the pre-update backup must be restored as above. Pointing the link back at the
newer release (`ln -sfn /opt/livera/releases/NEWER /opt/livera/current`, then
`systemctl restart livera-server livera-gateway`) brings the game back in the meantime.

## 10. What's where

| | |
|---|---|
| The world (database) | `/var/lib/livera/world.db` |
| Backups | `/var/lib/livera/backups/` |
| Settings | `/etc/livera/` (`deploy.conf`, `gateway.env`, `server.env`, `director.env` with the script accounts' passwords) |
| The installed version | `/opt/livera/current` (a link to `/opt/livera/releases/<commit>`) |
| Source code | `/opt/livera/src` |
| Web server config | `/etc/caddy/Caddyfile` (rewritten by every install/update) |

Only ports 22 (SSH), 80 and 443 are open. The game server itself listens only inside the machine;
browsers reach it through Caddy (HTTPS) and the WebSocket gateway.

## 11. If something goes wrong

- **The install stopped with a red message.** Read the line above it, fix that (often: the server
  ran out of memory, or the internet connection dropped), then paste the same command again. It
  picks up where it can and never deletes your world.
- **"The tests failed".** Nothing was installed; the version you had keeps running. This is a bug
  in the game code, not your server: report it with the last lines of the output.
- **The address doesn't open, or the browser warns about the certificate.** Wait two minutes and
  reload. If it still fails: with a domain, check the A record points at this server; in your
  provider's dashboard, if you turned on a *cloud firewall*, allow ports 80 and 443 there too.
  The free `sslip.io` address is shared by many people, so its certificates can be rate-limited
  now and then; a domain of your own avoids that. Caddy's log says why: `journalctl -u caddy -n 50`.
- **The page opens but says it can't connect.** `systemctl status livera-server livera-gateway`
  and `journalctl -u livera-gateway -n 50`.

## 12. Not done yet

Be clear with your friends about these:

- **Voice chat**: not built yet. Proximity voice is designed (`docs/proposals/voice.md`) and is
  next; text chat (whisper, say, shout) works now.
- **Moderation tools**: there is no report, mute or block button and no saved chat log to review.
  Only invite people you trust.
- **Forgotten passwords**: there is no reset. Make the person a new account, and free their
  character with the `--release-character` command above so they can pick it again.
- **Real-money purchases** are switched off (no app store billing is connected).
- **The 2.5D web client is a preview**: the street layout and building shapes are sketches, and the
  bus is a single-rider shuttle for now.
- **No monitoring or alerts**: if the server goes down, you'll find out by trying to play
  (it restarts itself after a crash, and starts by itself after a reboot).
- **Not yet tried on a real rented server** (see below).

## How this was checked

On a development machine, without a real server: shell syntax and ShellCheck on every script;
the Caddyfile with `caddy validate`; and a full dry run of the install in an isolated sandbox with
the system parts imitated (package installs, firewall and systemd were stand-ins; the build, the
tests, the release, accounts, the game server, the gateway and the town director really ran): a
fresh install, a second run that changed nothing, an update, an update whose tests fail (nothing
changed), adding players and backups, re-runs that change the domain and the player limit (the
running gateway and server take the new setting), and turning the scripted founders off, through
an update, and on again. Not checked: real package downloads (the Node.js and Caddy
repositories couldn't be reached from the development machine), real systemd (including its
security settings), the real firewall, getting a real HTTPS certificate, the swap file step and
the 2 GB memory limit during the build.
