# TSM mobile v2.1 + backend v1.1: your 11 test findings

This update goes on top of v2.0. Two parts: a **backend update** (v1.1: saved shipping address and the real
seller application with document upload and staff review) and an **app update** (v2.1: all 11 findings).
Install the backend first, then the app.

I could not compile Swift here. I checked every file for syntax errors with a Swift parser, ran the
backend's 68 automated tests (all pass), and checked that the server's real replies match what the app
expects. Xcode has the final say. If it shows red errors, paste them to me and I'll fix them.

## Your findings, one by one
| # | You found | Now |
|---|---|---|
| 1 | Bell on Home did nothing | Opens **Notifications**. A red dot shows until you've opened it. |
| 2 | Sign out had no confirmation | Account tab asks "Sign out?" first. |
| 3 | No add-to-cart / view-cart / Buy Now on the product page | **Add to Cart** shows "Added to cart" with a **View Cart** button. Cart icon (with item count) on the product, shop and favorites screens. **Buy Now** goes straight to checkout for that one offer. |
| 4 | Heart on product page and heart in the list disagreed | One shared favorites list; both always match. |
| 5 | No way to find favorites | **Favorites** chip on every shop page, a heart icon on Home, and Account > Favorites. |
| 6 | "Proceed to Payment" did nothing | Demo checkout: shows your order, then "Place demo order?". No card is charged. Then an order confirmation screen. |
| 7 | No address in the profile | **Shipping address** in Edit Profile, in the Account tab, and as a prompt at checkout when it's missing. Saved on the server (Live mode). |
| 8 | Sell / Orders tabs still show mock data | Left as is on purpose, until the admin site exists. |
| 9 | Re-opening the seller application should say wait for review | The app asks the server. Waiting: "Your application is under review" with what you sent. Approved: you're a seller. Declined: you see the reason and can reapply. |
| 10 | Sell-to-us product list too short / dropdowns | First dropdown is a **Brand filter**, second lists any active product (from the full catalog), filtered by that brand. |
| 11 | New sell-to-us ticket didn't show in the list | It shows right away on the Sell tab. |

## What's new on the server (backend v1.1)
- `GET/PUT/DELETE /api/me/address` (and the address is included in "Export my data").
- Real seller application: `POST /api/me/seller-application` (with up to 5 documents: PDF, JPEG, PNG or HEIC, 10 MB each), `GET` to see its status.
- Staff review API (list, detail, download a document, start review, approve, decline with a reason). Every action is written to the audit log.
- Approving creates the seller profile. Deleting your account declines any open application and removes uploaded files.
- Uploaded files go in `backend/storage/` (not in git).

## Install the backend (Terminal)
```
cd ~/School
cp -R backend backend-backup-before-v1.1          # optional safety copy
unzip -o ~/Downloads/TSM-backend-v1.1.zip -d ~/School
cd ~/School/backend && npm install
```
This keeps your `.env`. Then add the new address table to your **real** database, once. Either:
- **Workbench:** File > Open SQL Script > `~/School/db/sql/migrations/001_user_addresses.sql`, then the lightning bolt; or
- **Terminal:** `mysql -u tsm_app -p < ~/School/db/sql/migrations/001_user_addresses.sql` (password `rootroot`).

Your data stays. Restart the server: `npm run dev`.

## Install the app (Terminal)
```
cd ~/School
cp -R mobile mobile-backup-before-v2.1
unzip -o ~/Downloads/TSM-mobile-v2.1.zip -d mobile
mv mobile/TSM-v2.1-CHANGES.md docs/
```
Close and reopen Xcode, then Cmd+B and Cmd+R. No new Xcode settings are needed.

## Approving a real application (no admin site yet)
The React admin site is the next step. Until then, with the server running, use a second Terminal tab:
```
cd ~/School/backend
npm run review -- list
npm run review -- approve 6e837edc "Welcome aboard"
npm run review -- decline 6e837edc "The permit has expired."
```
(Use the first 8 characters of the id shown by `list`. A decline needs a reason; the applicant sees it.)

## Try it (about 15 minutes)
1. Sign in as **Buyer**. Tap the bell on Home (finding 1). Open **Pokémon > Collector Set Alpha**.
2. Tap the heart on the product page, go back: the heart on the tile matches. Tap the **Favorites** chip (4, 5).
3. Tap **Add to Cart** (a banner with View Cart appears), then **View Cart** > **Proceed to Payment** (3, 6).
4. At checkout it asks for a shipping address. Fill it in and save. Place the demo order (7, 6).
5. Product page > **Buy Now**: straight to checkout for that offer (3).
6. Account tab > **Sign Out**: it asks first (2).
7. Create a new account, then Account > **Seller Application**. Fill the form, attach a PDF or photo, submit (9).
   Close it and open Seller Application again: you see the waiting screen.
8. In Terminal: `npm run review -- list`, then `approve <id>`. Back in the app, switch to another tab and back to Account (it re-checks with the server): **Approved seller**.
9. Sign in as **Applicant** and open the seller screen: it shows the seeded application, waiting (9).
10. Sell tab > **New Submission** (as an approved seller): choose a Brand filter, then pick a product, submit. The ticket appears in the Sell tab list (10, 11).

## Still demo / on-device only
- **Orders and Sell tabs** show mock data. Demo-checkout orders disappear when the app is closed.
- **Tickets and favorites** are stored on the phone for each account, not on the server yet.
- The two documents on the seeded Applicant application are database records only; staff can't download them (no file exists).
- No email or notification is sent when an application is approved or declined yet.
- The sell-to-us **Source** dropdown still uses sample names (later it will come from the seller's distributor list).
- The sell-to-us filter is by **Brand**. Easy to switch to product type if you prefer.
- The **Test** option under "Product Source" in the application form is only in debug builds and auto-approves; it needs `ALLOW_TEST_SELLER_AUTOAPPROVE=true` in the backend `.env`.

## If something goes wrong
| You see | Do this |
|---|---|
| "Can't reach the TSM server" | Server or MySQL isn't running. Account > Demo tools > Test connection |
| Address screen says it can't save | The migration step above hasn't been run on `tsm` |
| Application upload fails right away | Use PDF/JPEG/PNG/HEIC under 10 MB; the app shows the server's reason |
| `npm run review` says it can't connect | Start `npm run dev` first |
| Red errors in Xcode | Paste them to me |

## Files
New in the app: `Models/AddressModels.swift`, `Shared/{AppRouter,FavoritesStore,OrderStore,SellToUsTicketStore,CartToolbarButton}.swift`,
`View/Account/ShippingAddressView.swift`, `View/CartOrders/OrderConfirmationView.swift`, `View/Notifications/NotificationsView.swift`,
`View/Shop/FavoritesView.swift`. (`Networking/*` and `Shared/AppSession*.swift` are included again, updated from v2.0.)
Changed: `App/{ContentView,MyCards440WApp}.swift`, `Models/{Models,OrderModels,SellToUSModels}.swift`, `Shared/ProfileStore.swift`,
`View/Account/{EditProfileView,AccountSecurityView,DemoToolsView}.swift`, `View/Auth/*`, `View/CartOrders/*`,
`View/Home/HomeView.swift`, `View/SellToUs/{SellToUsGateView,SellToUsItemFormView,SellToUsListTicketView}.swift`,
`View/Seller/SellerApplicationView.swift`, `View/Shop/{ProductDetail,ShopBrowse}View.swift`.
Everything else is exactly as before.
