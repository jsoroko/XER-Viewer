# Deploying XER Viewer on a Raspberry Pi — Cloudflare + Nginx + Podman Quadlet

This follows the standard `myapp` deployment guide (native Cloudflare Tunnel + Nginx on
the host, the app as a rootless Podman Quadlet), applied to XER Viewer.

This guide uses **`xer.sorocore.co.uk`** as the hostname. If you would rather use a different one,
replace it throughout.

## What is different from the standard guide

XER Viewer is a **static website**. Files are parsed in the visitor's browser and are
never sent to a server, so there is no API, no database and no secrets to configure.

| Standard guide step | Here |
| --- | --- |
| Postgres container, `data/db` volume | **Dropped** — nothing to store on the server |
| `.env` file (JWT secret, DB URL) | **Dropped** — the app has no configuration |
| `.network` + `.pod` Quadlets | **Dropped** — one container needs no pod |
| Bun-compiled server binary | Replaced by **nginx** serving the built files |
| Seed the database | **Dropped** |
| WebSocket block in the Nginx site | **Dropped** — the app doesn't use WebSockets |
| Port 3000 | **3100** — 3000 and 3001 are often taken by other apps; use any free port |

Everything else (system-wide `cloudflared`, host Nginx, explicit `podman build`,
`deploy.sh`, `podman logs`) is the same.

---

## 1. Architecture

```
[ Public Internet ] → [ Cloudflare Edge ]
                            │  (outbound-only tunnel, no open inbound ports)
                            ▼
                 [ cloudflared ]  (host service)
                            │  http://localhost:80
                            ▼
                 [ Nginx ]  (host service, reverse proxy)
                            │  proxies to 127.0.0.1:3100
                            ▼
              ┌──────────────────────────────┐
              │  xer-viewer-app (rootless)   │
              │  nginx serving static files  │
              │  listens on 8080 inside      │
              └──────────────────────────────┘
```

There are two nginx instances, and that is intentional: the **host** Nginx is the public
gateway (one place for all your apps' hostnames), and the small nginx **inside the
container** just serves the built files, with caching and security headers.

## 2. Folder layout

```
/home/<your-user>/
├── apps/
│   └── xer-viewer/
│       ├── deploy.sh              # update script (Section 8)
│       └── src/
│           └── xer-viewer/        # cloned repo — disposable, no secrets here
│               ├── Dockerfile
│               └── deploy/nginx.conf
└── .config/containers/systemd/
    └── xer-viewer-app.container
```

## 3. Host setup — add the new site to your existing Nginx and Cloudflare Tunnel

Nginx and `cloudflared` are already running on the Pi, so nothing is installed or upgraded
here. You only add one hostname to each. Your existing sites are left as they are: Nginx is
*reloaded* (not restarted), and `cloudflared` restarts once, which interrupts every app behind
the tunnel — including your SSH access if you use it — for a couple of seconds (see the warning in 3b).

### 3a. Quick checks

```bash
sudo systemctl is-active nginx cloudflared
# ^ both lines should say "active"

podman --version
# ^ needs a recent Podman (5.x); the standard guide's pod/HealthCmd Quadlets need it too

git --version
# ^ if "command not found":  sudo apt install -y git

ss -ltn | grep -E ':3100\b' || echo "3100 is free"
# ^ Ports 3000 and 3001 may already be in use on this Pi. This should print "3100 is free";
#   if something shows up instead, pick another port and use it in Sections 3c, 5 and 8.

loginctl show-user $USER | grep Linger
# ^ expect "Linger=yes" (this keeps your user's containers running after you log out).
#   If it says "no":  sudo loginctl enable-linger $USER
```

### 3b. Route the hostname through the tunnel

If your tunnel config lists specific hostnames (for example one for SSH access and one per app) and has
**no wildcard**, the new hostname needs its own rule.

First find which config file the running service reads. With no `--config` in the output it is
`/etc/cloudflared/config.yml`; it can also live under `/root/.cloudflared/` or `~/.cloudflared/`:

```bash
sudo systemctl cat cloudflared | grep ExecStart
# ^ shows how the service starts. Look for a --config path.

CONFIG=/etc/cloudflared/config.yml
# ^ set this to the path you found (this is the default when there is no --config)

sudo cp "$CONFIG" "$CONFIG.bak"
# ^ keep a copy so you can roll back instantly

sudo nano "$CONFIG"
```

Add **one rule above the catch-all 404**. Everything else stays exactly as it is:

```yaml
tunnel: xxxxxxxxxx
credentials-file: /root/.cloudflared/xxxxxxx

ingress:
  - hostname: admin.example.com             # existing — e.g. SSH access, do not touch
    service: ssh://localhost:22
  - hostname: app.example.com               # existing
    service: http://localhost:80
  - hostname: xer.sorocore.co.uk            # NEW: requests for this hostname...
    service: http://localhost:80            # ...go to the host nginx on port 80
  - service: http_status:404                # the catch-all must stay LAST
```

> **Read this before restarting.** If you reach the Pi over SSH *through this tunnel*
> (an `ssh://` rule like the first one above), restarting `cloudflared` drops your session for a few seconds. A
> config with a mistake would leave the tunnel down, and with it your remote SSH access — you
> would then need to be on the same network as the Pi to fix it. So **validate first**, and
> restart only if validation passes.

```bash
echo "CONFIG=[$CONFIG]"
# ^ must show your file's path. "CONFIG=[]" means the variable is empty (it only lasts for the terminal
#   session it was set in): set it again with CONFIG=/path/to/config.yml before the next commands.

sudo cloudflared tunnel --config "$CONFIG" ingress validate
# ^ checks the file is valid. Expect "OK". If it prints an error, fix the file and run it again;
#   do NOT restart until it says OK. ("No configuration file was found" = $CONFIG is empty or the
#   path is wrong.)

sudo cloudflared tunnel --config "$CONFIG" ingress rule https://xer.sorocore.co.uk
# ^ asks "which rule would handle this URL?". Expect it to show hostname xer.sorocore.co.uk and
#   service http://localhost:80 — not the 404 rule.

sudo systemctl restart cloudflared
# ^ reload the tunnel with the new rule. Reconnect your SSH session if it dropped.

sudo systemctl status cloudflared --no-pager
# ^ expect "active (running)"
```

To roll back if anything looks wrong (from a session that is still connected, or from the Pi's
local network):

```bash
sudo cp "$CONFIG.bak" "$CONFIG" && sudo systemctl restart cloudflared
```

**Add the DNS record** so the hostname points at your tunnel. Easiest, and needs no certificate
on the Pi — in the Cloudflare dashboard: **sorocore.co.uk → DNS → Records → Add record**

| Field | Value |
| --- | --- |
| Type | `CNAME` |
| Name | `xer` |
| Target | `<YOUR_TUNNEL_ID>.cfargotunnel.com` |
| Proxy status | Proxied (orange cloud) |

(The tunnel ID is the `tunnel:` value at the top of your config file.) The command-line
alternative is `cloudflared tunnel route dns <TUNNEL_NAME_OR_ID> xer.sorocore.co.uk`, but it needs
the login certificate (`cert.pem`) in the home directory of whoever runs it, and fails with
"Cannot determine default origin certificate path" if that isn't there.

### 3c. Nginx site config

This is the same shape as the blocks for your other sites (same port 80,
same proxy headers, matched by hostname), pointing at port 3100. The WebSocket lines are left
out because a static site has none.

```bash
sudo nano /etc/nginx/sites-available/xer-viewer
```

```nginx
server {                                     # one nginx "server block" — one website
    listen 80;                               # cloudflared delivers traffic to port 80 on this machine
    server_name xer.sorocore.co.uk;      # only answer requests for this hostname

    location / {                             # every URL path
        proxy_pass http://127.0.0.1:3100;    # hand the request to the app container

        proxy_set_header Host $host;                                   # pass on the hostname the visitor asked for
        proxy_set_header X-Real-IP $remote_addr;                       # the visitor's real IP, not nginx's
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;   # chain of proxies the request passed through
        proxy_set_header X-Forwarded-Proto $scheme;                    # whether the original request was http or https
    }
}
```

```bash
sudo ln -sf /etc/nginx/sites-available/xer-viewer /etc/nginx/sites-enabled/
# ^ enable the site (sites-available = written configs, sites-enabled = configs nginx actually loads)

sudo nginx -t && sudo systemctl reload nginx
# ^ check the whole config for errors first; reload only if the check passes.
#   A reload applies the change without dropping connections to your other apps.
```

Each site is matched by its own `server_name`, so this does not affect your other hostnames.
Leave nginx's `default` site alone unless you hit the "Welcome to nginx!" page (Section 9, item 7).

## 4. Get the code and build the image

The repository is private, so the Pi needs read access. The safest way is a **deploy key**:
an SSH key that can read *only this one repository* and cannot write to it.
(If you make the repository public, skip to "Clone", using
`https://github.com/jsoroko/XER-Viewer.git`.)

### 4a. Create a read-only deploy key

```bash
ssh-keygen -t ed25519 -f ~/.ssh/xer_viewer_deploy -N "" -C "raspberry-pi deploy key for XER-Viewer"
# ^ makes a new key pair used for this one repository only. -N "" = no passphrase, so deploy.sh can run unattended.

cat ~/.ssh/xer_viewer_deploy.pub
# ^ print the PUBLIC half; copy the whole line
```

In GitHub: **XER-Viewer → Settings → Deploy keys → Add deploy key**. Paste the line, give
it a title like `raspberry-pi`, and **leave "Allow write access" unticked**.

Tell SSH to use that key for this repository:

```bash
nano ~/.ssh/config
```

```
Host github-xer
    HostName github.com
    User git
    IdentityFile ~/.ssh/xer_viewer_deploy
    IdentitiesOnly yes
```

```bash
chmod 600 ~/.ssh/config
ssh -T git@github-xer
# ^ first connection asks whether to trust GitHub's host key. Check the fingerprint shown is exactly
#     SHA256:+DiY3wvvV6TuJJhbpZisF/zLDA0zPMSvHdkr4UvCOqU   (ED25519)
#   which is GitHub's published one (https://docs.github.com/authentication/keeping-your-account-and-data-secure/githubs-ssh-key-fingerprints),
#   then type "yes". Expected reply: "Hi jsoroko/XER-Viewer! You've successfully authenticated..."
#   If the fingerprint differs, answer "no" and stop.
```

### 4b. Clone and build

```bash
mkdir -p ~/apps/xer-viewer/src
mkdir -p ~/.config/containers/systemd
# ^ create the folders; -p = no error if they exist, and create missing parents

cd ~/apps/xer-viewer/src
git clone git@github-xer:jsoroko/XER-Viewer.git xer-viewer
# ^ the trailing "xer-viewer" names the local folder, so it matches the paths used below
ls ~/apps/xer-viewer/src/
# ^ should show exactly "xer-viewer"

cd xer-viewer
podman build -t localhost/xer-viewer-app:latest .
# ^ build the image from the Dockerfile here. It runs two stages: Bun compiles the React/Tailwind app,
#   then only the finished files are copied into a small nginx image. First build takes a few minutes on a Pi.
```

Verify the image and its exact tag (a typo makes Podman try to *pull* it from a registry — see Section 9):

```bash
podman images | grep xer-viewer
```

**Test the image on its own before involving systemd**, so a problem is easy to place:

```bash
podman run --rm -d --name xer-test -p 127.0.0.1:3199:8080 localhost/xer-viewer-app:latest
# ^ start a throwaway copy on a spare port (--rm deletes it when stopped)

curl -s -o /dev/null -w "HTTP %{http_code}\n" http://127.0.0.1:3199/          # expect HTTP 200
curl -s http://127.0.0.1:3199/healthz                                          # expect: ok
curl -sI http://127.0.0.1:3199/ | grep -i content-security-policy              # expect the policy line

podman stop xer-test
# ^ stop and remove the test container
```

## 5. Quadlet file

Only one file is needed (the standard guide's network, pod and database Quadlets are not).

```bash
nano ~/.config/containers/systemd/xer-viewer-app.container
```

```ini
[Unit]
Description=XER Viewer (static site, nginx)
# ^ human-readable label shown in systemd logs

[Container]
Image=localhost/xer-viewer-app:latest
# ^ use the image you built in Step 4 rather than pulling one from the internet.
#   Must match the tag shown by "podman images" exactly.

ContainerName=xer-viewer-app
# ^ the name shown by `podman ps`, and used by `podman logs xer-viewer-app`

PublishPort=127.0.0.1:3100:8080
# ^ make the container's port 8080 reachable as port 3100 on this machine ONLY (127.0.0.1),
#   not from other devices on your network. Host nginx is the only way in.

NoNewPrivileges=true
DropCapability=ALL
# ^ optional hardening: the container gains no extra privileges and holds no Linux capabilities;
#   a static file server needs none. If `systemctl --user daemon-reload` complains about
#   these two keys, your Podman is too old — delete them, nothing else depends on them.

HealthCmd=wget -q --spider http://127.0.0.1:8080/healthz
# ^ Podman periodically checks the site really answers, not just that the process started.
#   (127.0.0.1, not "localhost": nginx here listens on IPv4 only.)

HealthInterval=30s
HealthTimeout=5s
HealthRetries=3

[Service]
Restart=always
# ^ if the container stops or crashes, systemd starts it again

[Install]
WantedBy=default.target
# ^ start automatically at boot (works together with `loginctl enable-linger` from Section 3)
```

## 6. Launch

```bash
systemctl --user daemon-reload
# ^ make systemd re-read the Quadlet files, since you just added one

systemctl --user start xer-viewer-app.service
# ^ start the container
```

As in the standard guide, `systemctl --user enable` is not used: Quadlet services are
generated, and the `[Install]` section above already makes this one start at boot.

Watch it and check it:

```bash
podman ps
# ^ should list xer-viewer-app as "Up ... (healthy)" (healthy appears after the first check, ~30s)

podman logs xer-viewer-app
podman logs -f xer-viewer-app
# ^ the container's own output (-f follows live). Use this rather than journalctl, which can show
#   "No journal files were found" on some setups even when everything is fine.

curl -s -o /dev/null -w "HTTP %{http_code}\n" http://127.0.0.1:3100/
# ^ the container, through the published port (expect HTTP 200)

curl -s -o /dev/null -w "HTTP %{http_code}\n" -H "Host: xer.sorocore.co.uk" http://127.0.0.1/
# ^ through the host nginx (expect HTTP 200)

curl -s -o /dev/null -w "HTTP %{http_code}\n" https://xer.sorocore.co.uk
# ^ from outside: through Cloudflare, the tunnel and nginx
```

Then open `https://xer.sorocore.co.uk` in a browser, click **Try a sample project**, and
check the Overview, Schedule and Tables views load.

## 7. Notes on running it

- **Privacy:** the server never receives a user's file, and the container's security policy
  (`Content-Security-Policy`, set in `deploy/nginx.conf`) forbids the page from contacting any
  other address. There are no logs of file contents because there are no file contents.
- **Access:** the site is public to anyone with the URL. To restrict it, put the hostname behind
  **Cloudflare Access** (Zero Trust → Access → Applications) — no server changes needed.
- **Remembered file:** the app remembers a user's last file in *their* browser, per hostname.
  Changing the hostname later means returning users start fresh.
- **Resources:** the running container is a few MB of nginx; the only heavy moment is
  `podman build`. If a build is killed for lack of memory, close other services or add swap.

## 8. Deploy script for future updates

```bash
nano ~/apps/xer-viewer/deploy.sh
```

```bash
#!/bin/bash
# ^ run this file with bash

set -e
# ^ stop the whole script at the first failing command

echo "Pulling latest code..."
cd ~/apps/xer-viewer/src/xer-viewer
git pull --ff-only origin main
# ^ fetch the newest "main" and refuse anything that isn't a clean fast-forward

echo "Rebuilding image..."
podman build -t localhost/xer-viewer-app:latest .
# ^ bake the new code into a fresh image. This runs BEFORE the restart, so if the build fails the
#   currently running site is left untouched.

echo "Restarting app..."
systemctl --user restart xer-viewer-app.service
# ^ relaunch the container from the new image (a few seconds of downtime)

echo "Pruning old image layers..."
podman image prune -f
# ^ delete images left over from previous builds to save disk space; -f skips the prompt

echo "Checking the site..."
for i in 1 2 3 4 5 6 7 8 9 10; do
  if curl -fsS -o /dev/null http://127.0.0.1:3100/healthz; then
    echo "Done. $(git rev-parse --short HEAD) is live."
    exit 0
  fi
  sleep 1
done
# ^ wait up to 10 seconds for the container to answer

echo "The site did not come up. See: podman logs xer-viewer-app"
exit 1
```

```bash
chmod +x ~/apps/xer-viewer/deploy.sh
# ^ make the script executable
```

To ship an update: push your changes to GitHub (`main`), then on the Pi run:

```bash
~/apps/xer-viewer/deploy.sh
```

A bare `systemctl --user restart` relaunches the *old* image; the `podman build` step is what
puts new code in. Visitors get the new version on their next page load, because the container
tells browsers to re-check `index.html` every time.

## 9. Troubleshooting

1. **`podman ps -a` never shows `xer-viewer-app`.** Check the service directly:
   ```bash
   systemctl --user status xer-viewer-app.service -l --no-pager
   ```
   `activating (start)` that never changes, with a rising restart counter, is a crash-restart loop.

2. **`pinging container registry localhost ... connection refused`.** Podman is trying to *pull*
   the image, which means the tag in `Image=` doesn't match a locally built one. Compare
   `podman images | grep xer-viewer` with the `Image=` line character for character. Fix with either
   `podman tag localhost/xer-viewer-app:<wrong-tag> localhost/xer-viewer-app:latest` or rebuild (Step 4b),
   then `systemctl --user restart xer-viewer-app.service`.

3. **`daemon-reload` warns about `NoNewPrivileges` / `DropCapability` / `HealthCmd`.** Your Podman
   doesn't know that key. Remove that line (they are optional) and reload.

4. **Address already in use (port 3100).** Something else is listening. Find it with
   `ss -ltnp | grep 3100`, or pick another port and change it in *both* `PublishPort=` and the host
   nginx `proxy_pass`.

5. **502 Bad Gateway from the public URL.** Host nginx can't reach the container. Test
   `curl http://127.0.0.1:3100/healthz` on the Pi; if that fails the container isn't running
   (`podman ps`, `podman logs xer-viewer-app`).

6. **Cloudflare error 1033 / 404 from cloudflared.** The hostname isn't in the tunnel config or has
   no DNS record: recheck Section 3b (rule above the catch-all, `route dns`), and that
   `sudo systemctl restart cloudflared` was run.

7. **The domain shows nginx's "Welcome to nginx!" page**, though `curl http://127.0.0.1:3100` works.
   The default site is still enabled:
   ```bash
   ls -la /etc/nginx/sites-enabled/
   sudo rm -f /etc/nginx/sites-enabled/default
   sudo nginx -t && sudo systemctl reload nginx
   ```

8. **Blank page or the browser console mentions "Content Security Policy".** Something in the page is
   being blocked by the policy in `deploy/nginx.conf`. The console names the exact directive; the app
   itself needs nothing beyond same-origin files and inline styles.

9. **`cloudflared ... ingress validate` says "No configuration file was found".** `$CONFIG` is empty or points at
   the wrong place. Run `echo "CONFIG=[$CONFIG]"`, list the candidates with
   `ls -la /etc/cloudflared; sudo ls -la /root/.cloudflared`, and set `CONFIG=` to the file that exists
   (`sudo systemctl cat cloudflared | grep ExecStart` shows which one the service reads).

10. **`git pull` asks for a password / "Permission denied (publickey)".** The deploy key isn't set up
   or was added without access to this repository: redo Step 4a, and check
   `ssh -T git@github-xer`.

11. **The page still looks old after a deploy.** Confirm the build ran (`podman images` shows a new
    "created" time) and the service restarted (`podman ps`). A hard refresh (Ctrl/Cmd+Shift+R) rules
    out the browser.

## 10. What was and wasn't tested

Checked on a development Mac (Apple Silicon, the same CPU architecture as a Pi 5):

- The Dockerfile's build stage reproduced in a clean folder containing only the files it copies:
  `bun install --frozen-lockfile` and `bun run build` succeed and produce the five files that the
  cache rules in `deploy/nginx.conf` match.
- The exact security headers from `deploy/nginx.conf`, served with that build, and the whole app used
  under them (sample project, all three views, Gantt, dependency lines, dark theme, CSV export,
  remembering a file in the browser): no violations, and an outbound request to another site was
  refused, as intended.
- Both base images (`oven/bun:1.3`, `nginxinc/nginx-unprivileged:1.28-alpine`) publish `linux/arm64`.

**Not** run before writing this: the container image build itself, `nginx -t` on `deploy/nginx.conf`,
the Quadlet on a real Pi, and the Cloudflare/Nginx routing. That is why Step 4b tests the image on
its own first, and Section 9 lists the likely failures. Check your Podman version with
`podman --version` (Section 3) before starting.
