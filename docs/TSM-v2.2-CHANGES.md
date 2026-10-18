# TSM mobile v2.2 + backend v1.2: three fixes from your last test

Goes on top of v2.1 (with the Combine fix). Six app files and three backend files changed. No database change this time.

| # | You found | Now |
|---|---|---|
| 1 | A message added in a negotiation didn't show at the top | The log is **newest first** and your message appears at the very top right after you send it (tap the arrow or press Send on the keyboard). Each message shows its date and time. The send button is grayed out until you type something. |
| 2 | State was a free-text box | **State is a dropdown of 2-letter codes** (AL ... WY, plus DC). The server now refuses "Ohio" and accepts only the code; lower case like "oh" is tidied to "OH". An address saved earlier as "Ohio" is converted to "OH" when you open the screen; one it can't recognize shows "Select" so you pick the state. |
| 3 | Home banner sounded like selling on the platform | Now reads **HAVE SEALED PRODUCT? / SELL IT TO US**, says TSM buys the inventory and makes an offer and that it isn't a shop listing, and the button says **SELL TO US**. The approval screen's wording matches. |

## Good to know
- Negotiation messages are kept **on the phone** for now (per account), like tickets. They will go to the server, and the admin site will answer them, when we build the tickets API.
- Shipping accepts the 50 states and DC. Adding territories or military addresses (PR, GU, AA/AE/AP) is a one-line change in two places if you want them later.
- The server must be restarted to pick up the state rule (Ctrl+C, then `npm run dev`).

## Files
App: `Models/AddressModels.swift`, `Shared/SellToUsTicketStore.swift`, `View/Account/ShippingAddressView.swift`,
`View/Home/HomeView.swift`, `View/SellToUs/{SellToUsGateView,SellToUsTicketDetailView}.swift`.
Backend: `src/routes/me.js`, `src/lib/usStates.js` (new), `test/address.test.js`, `README.md`, `package.json`, `package-lock.json`.
Backend tests: 69 pass.
