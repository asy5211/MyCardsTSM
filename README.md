# TSM (The Sealed Market): setup guide for a Mac

Set up the whole TSM project on a MacBook: the MySQL database, the backend server, the admin website and the iPhone app. Follow the steps in order, and run each command box on its own.

> [!NOTE]
> **Built and tested on:** an Intel MacBook Pro, macOS 26.6.2, Xcode 26.5, Node.js 24.5.0 (npm 11.5.1) and MySQL Community Server 8.0.46.

## Contents

1. [Install the tools](#1-install-the-tools)
2. [Unpack the code](#2-unpack-the-code)
3. [Check Node.js](#3-check-nodejs)
4. [Finish the MySQL install](#4-finish-the-mysql-install)
5. [Create the databases](#5-create-the-databases)
6. [Start the servers](#6-start-the-servers)
7. [Start the admin website server](#7-start-the-admin-website-server)
8. [Open the app in Xcode](#8-open-the-app-in-xcode)
9. [Put the app on your iPhone](#9-put-the-app-on-your-iphone)
10. [Connect the app to the server](#10-connect-the-app-to-the-server)
11. [Open the admin website](#11-open-the-admin-website)
12. [Extras: logins, restarting, troubleshooting](#extras)

---

## 1. Install the tools

1. Install **Xcode** from the App Store: <https://apps.apple.com/us/app/xcode/id497799835?mt=12>

   > **Note:** The app only compiles on a MacBook. This is a SwiftUI project that is only supported on iOS.

2. Install the latest macOS version.

3. Install **MySQL 8.0.46** (`mysql-8.0.46-macos15-x86_64.dmg`): <https://dev.mysql.com/downloads/mysql/8.0.html>

   On that page, choose **macOS**, then **macOS 15 (x86, 64-bit), DMG Archive**.

   > **Important:** This guide was made on an older MacBook. To make sure yours matches, use the same version. If you already have a more recent MySQL, uninstall it and try again with this one if you hit any errors.

4. After the download finishes, double-click it and agree to all of the default settings in the MySQL pop-up to install it.

   > **Important:** This is not Workbench. MySQL works purely in the Terminal here. You will need to create a password for it (at least 8 characters). Write it down: this is your **root password**.

5. Download the zip file from GitHub for the TSM service: <https://github.com/asy5211/MyCardsTSM>. On that page click the green **Code** button, then **Download ZIP**.

---

## 2. Unpack the code

Next we extract the files in a way that prevents mistakes. Open **Terminal** (press <kbd>Command</kbd> + <kbd>Space</kbd>, type `Terminal`, press <kbd>Return</kbd>) and run the commands to extract it:

```bash
cd ~/Downloads
```

```bash
unzip -q MyCardsTSM-main.zip
```

Now run these commands to move it. Change `School` to the folder name of your choice (every later command in this guide uses `School`, so change those too if you do):

```bash
mv ~/Downloads/MyCardsTSM-main ~/School
```

```bash
ls ~/School
```

You should see a list that includes `admin`, `backend`, `db`, `docs` and `mobile`.

---

## 3. Check Node.js

Next, check which version of Node you have. You need to see **v20 or higher** (this guide was made with v24.5.0). Run this command to see it:

```bash
node -v
```

---

## 4. Finish the MySQL install

Now we finish the MySQL install with these commands:

```bash
echo 'export PATH="/usr/local/mysql/bin:$PATH"' >> ~/.zshrc
```

> [!WARNING]
> Run that first command only once. Running it twice adds the line to `~/.zshrc` twice.

```bash
source ~/.zshrc
```

```bash
mysql --version
```

Check that it installed correctly. You should see a line that includes `Ver 8.0.46` and `x86_64`.

Check that it worked with this command. It asks for the root password you set while installing MySQL from the dmg. Terminal shows nothing while you type a password; that is normal:

```bash
mysql -u root -p -e "SELECT VERSION();"
```

You should see `8.0.46` in a small table.

---

## 5. Create the databases

Now we create all of the databases in MySQL. Change the folder to match where you moved the code to (this guide uses `School`). Run these **one at a time**:

```bash
cd ~/School/db
```

```bash
mysql -u root -p < sql/00_create_database_and_user.sql
```

```bash
mysql -u root -p --default-character-set=utf8mb4 < sql/01_schema.sql
```

```bash
mysql -u root -p --default-character-set=utf8mb4 < sql/02_seed.sql
```

> [!WARNING]
> Make sure you run each one individually, because you need your root password for each of them. Running them all at once will mess it up.

This command lets you check that everything was created correctly:

```bash
mysql -u root -p --default-character-set=utf8mb4 -t < sql/03_verify.sql
```

You should see several tables of results. Near the bottom, `tables_found` is **25** and `views_found` is **1**.

---

## 6. Start the servers

Now we start the servers so that the app can work. Again, change `School` to match where you put the files. First the backend:

```bash
cd ~/School/backend
```

```bash
npm install
```

```bash
cp ../db/backend.env.example .env.example
```

```bash
npm run init-env
```

You should see `Created .env with new random secrets`.

```bash
npm test
```

This last one verifies that it downloaded correctly. It takes about 40 seconds and should end with `pass 365` and `fail 0`.

```bash
npm run dev
```

You should see `TSM API listening on http://localhost:4000`.

> [!IMPORTANT]
> Leave this Terminal tab open. The server only runs while it is open.

Now open a **new Terminal tab** (<kbd>Command</kbd> + <kbd>T</kbd>) without stopping the previous one, and run:

```bash
curl localhost:4000/health
```

This checks the status of the server. You should see `{"status":"ok","db":"up"` followed by the time.

---

## 7. Start the admin website server

The backend servers are now running. Next we set up the front-end server. In a new tab (you can also use the tab you used to check the health of the server), run the three commands below.

> [!WARNING]
> Don't stop the backend or close its tab.

```bash
cd ~/School/admin
```

```bash
npm install
```

```bash
npm run dev
```

You should see `Local: http://localhost:5173/`. Leave this tab open too.

---

## 8. Open the app in Xcode

Now we can open the code and the app. Change `School` to match where you moved it:

```bash
open ~/School/mobile/MyCards440W.xcodeproj
```

You will need to click **Trust** for this to open.

After you open the code, the build is likely to fail if you haven't used Xcode before. This is expected. In the toolbar you will need to click **Get** on the **iOS 26.5** option. This takes a while to install, and it is the simulator that runs the app. You will also need to sign in to your Apple account / developer account for the download to finish.

---

## 9. Put the app on your iPhone

1. After you finish that, set up **Developer Mode** on your iPhone: **Settings → Privacy & Security → Developer Mode**. The phone restarts.
2. Use a USB-C cord to plug your iPhone into your computer, then click the start (**Run**) button in Xcode to download the app onto the phone.
3. After the download starts for the first time, go to your iPhone's **Settings → General → VPN & Device Management** and tap **Trust** on your developer account.

---

## 10. Connect the app to the server

1. In the app, **sign in as a guest**, then go to settings (the **Demo tools** section of the **Account** tab). Change the data source to **Live server**.
2. Double-click the **Server address** and change it to match your real IP address. To find it, run this in Terminal; it prints your IP address:

   ```bash
   ipconfig getifaddr en0
   ```

3. Type the address as `http://` followed by your IP address, followed by `:4000`. For example: `http://192.168.1.20:4000`
4. After you finish connecting it, tap **Test connection** to verify it worked.

---

## 11. Open the admin website

To open the admin, go to **<http://192.168.1.20:5173/login>**.

Change `192.168.1.20` to match your own IP address: the same numbers you typed in the app, but ending in `5173` instead of `4000`.

---

## Extras

### Demo logins

These work only on your own Mac, with the demo data.

| Who | Where | Login | Password |
|---|---|---|---|
| Buyer | the app | `buyer@tsm.test` | `Password1!` |
| Approved seller | the app, or the admin site (**Seller**) | `seller@tsm.test` | `Password1!` |
| Seller with a pending application | the app | `applicant@tsm.test` | `Password1!` |
| Admin staff | the admin site (**TSM staff**) | `admin@tsm.test` | `AdminPass1!` |

### Starting and stopping later

MySQL starts by itself when the Mac starts. For the rest, open two Terminal tabs and run one command in each:

```bash
cd ~/School/backend && npm run dev
```

```bash
cd ~/School/admin && npm run dev
```

To stop either one, click its tab and press <kbd>Control</kbd> + <kbd>C</kbd>.

### Optional: demo pictures and sales

With the backend running, open a third Terminal tab:

```bash
mysql -u root -p --default-character-set=utf8mb4 < ~/School/db/sql/02b_seed_marketplace.sql
cd ~/School/backend
npm run demo:content
npm run demo:sales
```

The pictures are labelled "DEMO IMAGE". Reload the admin website and the app to see them.

### If something goes wrong

| You see | What it means and what to do |
|---|---|
| `Cannot reach MySQL at 127.0.0.1:3306 (ECONNREFUSED).` then `Failed running 'src/server.js'. Waiting for file changes before restarting...` | MySQL is not running. Open **System Settings**, choose **MySQL** at the bottom of the sidebar, click **Start MySQL Server**. Click the Terminal tab, press <kbd>Control</kbd> + <kbd>C</kbd>, then run `npm run dev` again. The tab does not return to the prompt by itself. |
| `mysql: command not found` | Terminal does not know where MySQL is. Run `source ~/.zshrc`, or close Terminal and open it again. |
| The PATH line (`export PATH=...`) is in `~/.zshrc` twice | The `echo` command in step 4 was run twice. It does no harm, but run it only once. |
| `ERROR 1045 (28000): Access denied for user 'root'` | The root password was mistyped. Run that same command again and type the password you set when you installed MySQL. |
| A later database command fails with `Table ... doesn't exist` | An earlier one failed first. Run the three database commands again, one at a time, and stop at the first `ERROR`. |
| `ER_ACCESS_DENIED_ERROR` when the server starts | The user or password in `backend/.env` does not match the database. Re-run `00_create_database_and_user.sql` and check that `DATABASE_URL` in `backend/.env` says `tsm_app:rootroot`. |
| `.env.example is missing` | Run the `cp ../db/backend.env.example .env.example` command in step 6, then `npm run init-env` again. |
| `npm install` says `2 high severity vulnerabilities` | This is a notice, not a failure. Ignore it and do not run `npm audit fix`. |
| `EADDRINUSE` | Another copy of the server is already running on port 4000. Find its Terminal tab and press <kbd>Control</kbd> + <kbd>C</kbd>. |
| The app says `Can't reach the TSM server at http://<address>:4000. Is it running?` | The server is not running, or the address is wrong. The app shows this for any reason the server is unreachable. Look at the backend Terminal tab to see which. |
| The app says iOS blocked an `http://` connection | In Xcode click the project, pick the app target, open the **Info** tab, add **App Transport Security Settings**, and inside it **Allows Local Networking** = YES. |
| The phone asks about the **Local Network**, or the Mac asks whether `node` may accept incoming connections | Tap or click **Allow**. |
| Xcode says signing needs a development team | Click the blue **MyCards440W** project icon, choose the **MyCards440W** target, open **Signing & Capabilities**, and pick your own Apple ID under **Team** (it ends in *Personal Team*). If it says the bundle identifier is not available, change it to something of your own, like `com.yourname.TSM`. |
| `ls ~/School` shows only a folder called `MyCardsTSM-main` | You already had a folder called `School`, so the code landed inside it. Run `mv ~/School/MyCardsTSM-main ~/TSM-code`, then use `~/TSM-code` wherever this guide says `~/School`. |
| The admin website does not open from another computer | Use the Mac's IP address, not `localhost`, as in step 11. The Mac's firewall may need to allow `node`. |
