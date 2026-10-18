# TSM admin website (v1.1)

One React website with two doors:

| Door | Who | What they do |
|---|---|---|
| **TSM staff** (`/staff`) | You and your team | See and manage everything: seller applications, the product catalog (pictures and descriptions), brands, sellers, users, every seller's offers, orders, sell-to-us tickets and price offers, support messages, fees, payouts, and the activity log of everything that happens. |
| **Seller** (`/seller`) | Approved sellers only | Run the business: list products **from your catalog**, see sales by day / week / month with TSM's fee and the payment (Apple) fee taken out, ship sold items with tracking numbers, message buyers, read and answer reviews, and set how TSM pays you. The iPhone app links here (Account → Seller dashboard). |

Everything the site does goes through the backend API (`~/School/backend`); the iPhone app reads the same data from the same backend. So a photo you upload here is stored by the backend and shows up in the app, and an offer a seller creates here appears on the product page in the app with its distributor and "Box 4 of 12".

**Folder layout** (next to the others):
```
~/School/
├── backend/   API (must be running)
├── db/        MySQL scripts
├── admin/     <- this folder
└── mobile/
```

## Start it (macOS Terminal)

You need Node (you already have it for the backend). Open **two** Terminal tabs.

Tab 1, the backend (as always):
```bash
cd ~/School/backend && npm run dev
```

Tab 2, this website:
```bash
cd ~/School/admin
npm install        # first time only, about a minute
npm run dev        # then open http://localhost:5173
```

The website forwards `/api` and `/media` to the backend on port 4000 (see `vite.config.js`). If your backend runs somewhere else: `BACKEND_URL=http://127.0.0.1:4100 npm run dev`.

## Sign in

On the sign-in page choose **TSM staff** or **Seller**.

| Who | Login | Password |
|---|---|---|
| Staff (super admin) | `admin@tsm.test` | `AdminPass1!` |
| Seller: Demo Seller | `seller@tsm.test` | `Password1!` |
| Other sellers | `hub@`, `elite@`, `prime@`, `alpha@`, `toptier@tsm.test` | `Password1!` |
| Pending applicant (approve them from the Staff side, then sign in as a seller) | `applicant@tsm.test` | `Password1!` |

(In development the sign-in page has a button that fills the staff or seller demo login for you.)

Make your own staff login: `cd ~/School/backend && npm run create-staff -- you@example.com "Your Name" super_admin`.

Roles: `super_admin` and `admin` can change things; `support` can look at everything but every change button is hidden.

## What each side can do

### Staff
- **Dashboard**: waiting applications, active sellers, users, how many products are *ready for sellers*, live offers, units in stock, inventory value, money owed to sellers, pending payouts, TSM commission, latest activity.
- **Seller applications**: the review queue. Open one to see the business, the distributors they named, and their uploaded documents (opening a document is logged). *Start review*, *Approve* (you may change the public store name) or *Decline* (the reason is shown to the applicant in the app).
- **Product catalog**: *this is where sellers' choices come from.* Create a product (brand, type, name, description), then upload up to 3 photos. The **main photo** is also the thumbnail in the shop. Photos are shrunk to 1200 px in your browser first. A product is **Ready for sellers** only when it is active and has a description (10+ characters) and a main photo. Sellers cannot change pictures or descriptions.
- **Brands**: the brand tiles on the app's Home screen. **Drag a brand by its ⠿ handle** (or use the arrows) and the new order is saved straight away. A new brand is added at the bottom.
- **Sellers**: every seller with their offers, sales and activity. *Remove selling* takes the seller role away **without** suspending the account (they can still sign in, shop, track orders and contact support; their offers leave the shop; *Restore selling* undoes it). *Suspend* locks the whole seller out and pulls all their offers from the shop at once; *Reinstate* undoes it. The page also shows their payout method (the full details need an admin and are logged).
- **Seller offers**: every offer from every seller (price, stock, source, distributor, box/pack, status). *Hold* takes an offer off the shop with a reason the seller can read; the seller cannot undo a hold. *Release* puts it back.
- **Orders**: every order, read-only: items with box numbers, buyer, shipping address, tracking, and the buyer–seller chat.
- **Sell-to-us tickets**: what approved sellers offer TSM. Open one to see the items and the negotiation, *Start review*, *Send a price* (the seller can accept, decline or counter in the app), *Accept* a counter-offer, *Decline*, remove an item, or mark it *Completed* once you have paid them (payment happens outside the app).
- **Support**: messages from the app's Contact support (signed-in people and guests). Reply in the thread and mark it answered or closed.
- **Users**: all accounts. Opening one is logged. *Suspend* signs them out immediately.
- **Fees**: TSM's fee (a flat 5% to start) and the payment (Apple) fee. Both are shown to sellers on their dashboard. A change only applies to **new** sales; each sale keeps the rates it was made at.
- **Payouts**: *Overview* (what each seller is owed), *Payouts* (create → send the money yourself → mark paid with the transfer reference, or cancel), *Sales ledger* (every sale: total, TSM fee, seller's share).
- **Activity log**: every change made in the app or on this site (who, what, when, from which IP). Filter by person, action, record, dates. **Export CSV…** asks for a **start and end date** and downloads only that time range (up to 366 days).

### Seller
- **Dashboard**: live / paused / on-hold / sold-out offers, units in stock, inventory value, what TSM owes you, latest sales, the fees taken.
- **Sales rates**: daily, weekly and monthly sales with TSM's 5% and the payment (Apple) fee taken out before a payout, what you receive, averages, a chart, and what TSM has paid out.
- **Sold items & shipping**: everything you sold, who bought it and where to ship it, with the box numbers. Add the carrier and **tracking number** (you can correct it later; the buyer gets a tracking link), and message the buyer about the order.
- **Reviews**: the stars and comments buyers left, filtered by product or by stars. Write a reply under any review.
- **My listings**: all your offers with price, stock, source, distributor and box/pack; **filter by brand, type or status**; edit, pause or resume each. Offers TSM put on hold show the reason.
- **List a product** (two steps): 1. pick a product from the TSM catalog (search by name or brand; you cannot add products yourself), 2. fill in **your price**, **how many you have in stock**, **where it was sourced from** (authorized distributor, retail store, direct from manufacturer, other), the **distributor or supplier** (your approved application's distributors are suggested), and whether it is **a box from a sealed case** (which box, out of how many: shown to shoppers as "Box 4 of 12") or **loose product**. A preview shows exactly what shoppers will see.
- **Earnings & payouts**: every sale with TSM's fee, the payment fee and what you receive, and each payout with its reference.
- **Payout method**: how TSM pays you (bank transfer, PayPal, Zelle or check). The details are encrypted and only a masked version is shown back to you.

Only sellers whose application was **approved** and whose selling has not been suspended or removed can sign in to the seller side; anyone else gets a clear message.

**Reaching the seller dashboard from the iPhone app.** The app's *Seller dashboard* link opens this website at `http://<your Mac's address>:5173/login?as=seller`. `npm run dev` already listens on your network (the Terminal shows it as *Network*). The phone and the Mac must be on the same Wi-Fi.

## First-time demo content

Your real database starts with products that have no pictures. To see the site (and the app) with pictures and descriptions straight away:
```bash
cd ~/School/backend && npm run demo:content
```
It adds labelled "DEMO IMAGE" pictures and a description to the demo products. Replace them one by one with real photos in the catalog.

## Build for a real server later

```bash
VITE_API_BASE=https://api.yourdomain.com npm run build     # creates dist/
```
`dist/` is plain static files for any web host. Then set `CORS_ORIGINS=https://admin.yourdomain.com` in the backend's `.env`, and serve the backend over HTTPS. (Not needed for development.)

## Good to know

- Sign-ins are kept in the browser tab only; closing the tab signs you out. An expired or revoked sign-in sends you back to the sign-in page.
- Money is shown in dollars; the API and database store whole cents.
- Payouts are **recorded** here, not sent. You send the money (bank transfer, later Shopify) and enter the reference.
- Sales appear in the ledger when someone places an order in the app (card payment itself is not collected yet; the fee split is recorded). For something to look at straight away, run `cd ~/School/backend && npm run demo:sales` while the backend is running.
- If a page ever shows "Something went wrong", reload; nothing is lost because every change is saved by the backend the moment you confirm it.

## Folder tour

```
admin/
├── index.html, vite.config.js, package.json
└── src/
    ├── api.js            talks to the backend (two separate sign-ins: staff / seller)
    ├── auth.jsx          who is signed in
    ├── format.js         money, dates, labels
    ├── imageResize.js    shrinks photos before upload
    ├── styles.css        the black / red look, same palette as the app
    ├── components/       buttons, cards, dialogs, tables helpers
    ├── layout/Shell.jsx  sidebar + page frame for each side
    └── pages/
        ├── Login.jsx
        ├── staff/        Dashboard, Applications, Catalog, ProductForm, Brands, Sellers, Offers, Orders, Tickets, Support, Settings (Fees), Users, Payouts, Audit
        └── seller/       Dashboard, Sales (rates), Orders (sold items), Reviews, Listings, ListingForm, Earnings, PayoutMethod
```
