# TSM v4.0.1: a Swift fix and `make backend-up`

Two things, nothing else changed.

| File | What |
|---|---|
| `mobile/MyCards440W/Networking/ServerModels.swift` | **Fixes** `Call to main actor-isolated static method 'dollars(cents:)' in a synchronous nonisolated context`. One line passed the money helper as a function value (`agreed.map(Money.dollars(cents:))`); it is now a plain closure, and the three `Money` helpers are marked `nonisolated` so they can be called from anywhere. It was a real compile error, so the app would not have built until this was fixed. |
| `Makefile` | **New.** One command to start the backend. Goes in `~/School`, next to `backend`, `admin` and `db`. |

## Install (Terminal)

Stop anything running in your Terminal tabs first (Ctrl+C). Then:

```bash
SRC=~/Downloads/TSM-v4.0.1-patch
ls "$SRC"
```

Expect: `Makefile  TSM-v4.0.1-PATCH.md  mobile`. Then:

```bash
STAMP=$(date +%Y%m%d-%H%M)
cp ~/School/mobile/MyCards440W/Networking/ServerModels.swift ~/School/mobile/ServerModels.swift.backup-$STAMP
[ -f ~/School/Makefile ] && cp ~/School/Makefile ~/School/Makefile.backup-$STAMP
cp "$SRC/mobile/MyCards440W/Networking/ServerModels.swift" ~/School/mobile/MyCards440W/Networking/ServerModels.swift
cp "$SRC/Makefile" ~/School/Makefile
cp "$SRC/TSM-v4.0.1-PATCH.md" ~/School/docs/
```

In **Xcode**, press Cmd+B. If it shows any other red error, send me the text and the file and line.

## Using the Makefile

```bash
cd ~/School
make backend-up
```

That does, in order:

1. Checks MySQL and starts it if it is not running (see the note below).
2. Creates `backend/.env` or installs packages only if they are missing.
3. Starts the API (http://localhost:4000) and the admin website (http://localhost:5173) together in this one tab. Their lines are labelled `[api]` and `[website]`.

Press **Ctrl+C** to stop both (a line like `make: *** [backend-up] Terminated` or `Interrupt` afterwards is normal). MySQL is left running.

| Command | What it does |
|---|---|
| `make backend-up` | MySQL check + API + website |
| `make api-up` | MySQL check + only the API |
| `make backend-down` | stops the API and the website from another tab (MySQL stays up) |
| `make backend-status` | shows what is running |
| `make backend-test` | runs the automated tests (they use the separate `tsm_test` database, never your real data) |
| `make demo-sales` | adds sample orders, reviews and tickets (the API must be running) |
| `make mysql-up` | only makes sure MySQL is running |
| `make` or `make help` | prints this list |

From any folder you can use `make -C ~/School backend-up`.

## How it was checked, and what was not

I ran every target above against a real MySQL 8 server and the real API and website on Linux: start, the "already running" refusal, Ctrl+C, `backend-down` (no leftover processes), `api-up`, `backend-test` (288 pass). Two things differ on your Mac and I could not run them there:

- **Starting MySQL for you.** If MySQL is already running (the usual case) nothing needs to start. If it is not, the Makefile tries `sudo /usr/local/mysql/support-files/mysql.server start` (the installer version; it asks for your Mac password) or `brew services start mysql` (Homebrew). If neither fits your setup it says so and tells you to start MySQL yourself, then run the command again.
- `make` comes with Xcode's command line tools, which you have if you build the app. If `make` says "command not found", run `xcode-select --install`.
