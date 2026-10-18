# TSM mobile v2.0: the app now talks to your server

Built on **your current app** (the `MyCards440W-current.zip` you sent), not on my untested v1.5.
It adds a switch between **Demo data** (works with no server, like before) and **Live server**
(the Node/MySQL backend you already have running). Live is the default.

I could not compile Swift here. I checked every file for syntax errors with a Swift parser and
checked that the server's real responses match what the app expects, but Xcode has the final say.
If Xcode shows red errors, paste them to me and I'll fix them.

## What works in Live mode
- **Sign in** with email or username. Wrong password shows the server's message.
- **Create account**. Server-side checks show in the form (taken email/username, weak password).
- **Forgot / reset password**. The reset link comes from the server and carries a one-time code.
- **Home brands, brand pages, search, product-type filter, sort.** All from the database.
- **Product page**: every seller's offer, cheapest first. The sold-out rule is applied by the server:
  a seller who sells out disappears from the list; the product grays out only when all sellers are out.
- **Seller accounts**: sign in as the demo seller and your own offer shows first, in gold, as "Your Listing".
- **Account tab**: seller status comes from the server; Edit Profile saves username and phone to the server.
- **Privacy & security** (Account tab, signed in): change password, export my data, delete my account.
- **Demo tools** (Account tab): Data source switch, server address, "Test connection".

## Still demo-only (next steps)
Seller application (the form does not reach the server yet), cart, checkout and orders, Sell to Us
tickets, banners, notifications, reviews. In Live mode the app tells you which data comes from where.

## Install (Terminal)
```
cd ~/School
cp -R mobile mobile-backup-before-live          # safety copy first
unzip -o ~/Downloads/TSM-mobile-v2.0.zip -d mobile
mv mobile/TSM-v2.0-CHANGES.md docs/
```
New files appear in Xcode by themselves (the project uses synced folders). If Xcode was open, close and reopen it.

## Run
1. Terminal window 1: `cd ~/School/backend && npm run dev` (leave it running; MySQL must be running too).
2. Xcode: pick an iPhone simulator, press Cmd+B, then Cmd+R.

## One-time Xcode settings
- **Plain-http permission** (only if you see "iOS blocked the connection"): click the blue project icon,
  pick the app target, open the **Info** tab, add **App Transport Security Settings**, inside it add
  **Allows Local Networking** = YES.
- **Reset-password link** (needed once, skip if already done): same Info tab, **URL Types**, press +,
  set Identifier `tsm` and URL Schemes `tsm`.

## Try it (about 10 minutes)
1. First screen is the sign-in screen. Under the form it says "Data source: Live server".
2. Tap **Buyer** (the small chip), then **Sign In**. Home shows the 12 brands from the database.
3. Open **Pokémon**. Try the type chips and Sort. Open **Collector Set Alpha**.
4. Open **Magic > Elite Series**. It is the one fully sold-out product (grayed out).
5. Account tab: sign out. Sign in with the **Seller** chip, open Collector Set Alpha again. Your offer is first, in gold.
6. Account tab > Seller status reads **Approved seller** (Seller), **Application under review** (Applicant), **Not applied** (Buyer).
7. Create a new account with your own email/username. Edit Profile and change the phone. Sign out and back in; it stuck.
8. Forgot password: send a link for your new account. In the Terminal running the server, copy the line starting `tsm://reset-password?token=`.
   In a second Terminal: `xcrun simctl openurl booted "tsm://reset-password?token=PASTE_HERE"` then set a new password and sign in with it.
9. Account > Privacy & security: change the password, export your data, then delete this test account.
10. Account > Demo tools: switch to **Demo data**; the app behaves as it did before. Switch back to Live.
11. Stop the server (Ctrl+C) and pull to the Home tab: you get "Can't reach the TSM server" and a Try Again button.

## If something goes wrong
| You see | Do this |
|---|---|
| "Can't reach the TSM server" | Server not running, or MySQL is down. Check Terminal window 1; Account > Demo tools > Test connection |
| "iOS blocked the connection..." | The Allows Local Networking step above |
| Brand page is empty in Live mode | Run `npm test` in the backend to confirm the data; then Test connection |
| Reset link does nothing | URL Types step above; use the link from the server window, not the one typed from memory |
| Red errors in Xcode | Paste them to me |

On a real iPhone later: the phone reaches your Mac by its network address, not 127.0.0.1.
Put that address in Demo tools > Server address and start the server so it accepts connections from the network.

## Files
New: `Networking/` (AppConfig, APIClient, APIModels, TokenStore), `Shared/AppSession.swift`,
`Shared/AppSession+Catalog.swift`, `View/Account/DemoToolsView.swift`, `View/Account/AccountSecurityView.swift`.
Changed: `App/ContentView.swift`, `App/MyCards440WApp.swift`, `Models/Models.swift`, `Shared/ProfileStore.swift`,
`View/Account/EditProfileView.swift`, `View/Auth/{CreateAccount,ForgotPassword,ResetPassword}View.swift`,
`View/Home/HomeView.swift`, `View/Shop/{ShopBrowse,ProductDetail}View.swift`.
Everything else is exactly as you sent it.
