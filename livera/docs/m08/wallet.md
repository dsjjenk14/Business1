# M0.8 wallet: coins for real money, phones, LivPay

The product owner asked: "Make things that are buyable with coins which you get with real money."
"Add phones, add an Apple Pay like system for characters." This feature adds a premium currency
(**coins**) with a cosmetic coin shop, a phone in every adult's hand (models, battery, cases), and
**LivPay**, the phone's tap-to-pay and send-money system. No real brand names: phones are the
fictional **Lyra** line, the payment system is LivPay.

Code: `src/core/Wallet.cpp` (plus the `m08:wallet` blocks). Data: `data/economy/coins.json`
(coin packs, coin shop, LivPay limits) and `data/items/phones.json` (phone and coin-shop items,
phone models). Circuit Electronics (`data/world/founding_town.json`) sells the Lyra One, Air and
Pro and a clear case. Tests: `tests/test_wallet.cpp` (18 tests, including three over the network).

Everything below is real and tested, except what the last section says is not done.

---

## 1. DECISIONS entries

## Coins are their own currency, verified by the server, and buy looks, not an edge
**Decision:** Coins live in a second zero-sum `Ledger` (`WorldState::coins`), apart from
dollars: accounts `coins:<character>` and the issuer `sys:coin_store`, the only account
allowed below zero (it holds minus every coin in circulation). Coins come only from coin packs
bought with real money. The client never says it paid: it sends a store receipt with
`buy_coins`, the server's payment verifier checks it, and only then does
`World::creditCoins` credit the pack, exactly once per receipt id (every credited receipt is
kept forever in the world save; a repeat is refused with `duplicate_receipt`, for any
character). Real App Store / Google Play verification isn't connected, so a production server
refuses every `buy_coins` with `payments_unavailable` and says why; dev servers (`--dev`) and
servers started with `--test-payments` use a test verifier that accepts receipts starting
`test-`, records them as test purchases and charges nothing. Coins never turn into dollars and
can't be sent to another player. The coin shop sells only cosmetic and status items, and
content validation enforces it: a coin item can't be usable, consumable, unlock anything,
change needs, be medicine or a drug, and can't beat (in style, feel-good emotion or, for a
phone, battery life and charge time) the best thing dollars buy in the same slot or category.
**Why:** Real money must never be trusted from a client (rule 1), and a receipt that could be
replayed would print coins. A separate ledger keeps the dollar economy honest: nothing bought
with real money can enter wages, rent or prices, so there's no pay-to-win and no laundering
real money into the town economy (or coins between accounts, which is how stolen cards and
gold-selling work in other games). Saying "payments unavailable" is the honest state today
(rule 6): the store integrations need the stores' server APIs and credentials, which is
platform work for the M1 client.

## Every adult carries a phone, and its battery matters
**Decision:** Phones are items (category `phone`) with a model in `phones.models`: hours a full
battery lasts online away from a charger, and hours from dead to full. Every adult has one in
hand (`CharacterState::phone`): the basic model is issued to anyone 18 or over who has none, on
load, on arrival and on their 18th birthday. Once a game hour the phone in your hand drains
while you're online and away from a charger, and charges in a home you're welcome in, at your
workplace while on shift, in a study session, at places with public outlets (`charge_at_types`:
the café, Circuit Electronics, the university, Common Ground) and while you're logged out (your
routine plugs it in). At 0% it's dead: every phone app and texting refuse with `phone_dead`
("Your phone is dead. Charge it at home or at work."), as do LivPay and the coin shop. Cash and
card still work, and others can still text you. Switching phones (`use` a phone, or
`switch_phone`) puts the old one in your inventory with its charge remembered; a phone still
in its box is full.
**Why:** A phone that can die makes it a thing you look after, like hunger, without making a
normal day hard: the basic Lyra One lasts 40 hours away from a charger (a long day out uses
about 40%), and a low-battery warning comes at 20%. Better phones are a real reason to spend
dollars (60 and 80 hours). The coin-only Gold Edition is exactly as good as the Pro, by rule.

## LivPay pays from your bank, with limits
**Decision:** LivPay is your phone paying from your bank account. Tap to pay: `buy` with
`method: "phone"` (ledger kind `livpay_purchase`) and `ride` with `pay_with: "phone"` (kind
`livpay_fare`). Send money: `livpay_send` moves dollars bank to bank, anywhere in town, to
anyone who has a phone (online or not), with a note; kind `livpay`; the recipient is notified
with the note. Limits from data: $2,500 a transfer, $5,000 and 20 transfers a game day (counted
from the ledger, so they survive restarts), notes up to 140 characters. All LivPay needs a
working phone.
**Why:** It's the "Apple Pay like system" the product owner asked for, built on the one ledger
so it can't create money. Limits make a stolen session or a scam cost something bounded. And
because LivPay pays from the bank, a pickpocket (who only ever takes cash) gets nothing from it.

---

## 2. SIMULATION.md section

## Phones, coins and LivPay

See the DECISIONS entries above.

- **Phones.** Battery is 0–100, stepped once a game hour for every character:
  `+100 / charge_hours` at a charger (or offline), `−100 / battery_hours` online away from one.
  Someone who logged in partway through the hour charges for the part they were away and
  drains for the rest. The hour's location decides: where you are at the top of the hour is
  where the phone spent it. A notification at the low-battery threshold (20%) and when it dies
  (online players only). Models: Lyra One 40 h / 3 h (issued free; $199 at Circuit
  Electronics), Lyra Air 60 h / 2.5 h ($499), Lyra Pro 80 h / 2 h ($1,099), Lyra Pro Gold
  Edition 80 h / 2 h (3,000 coins). Cases (clear $19.99; marble, glitter 150 coins; gold-leaf
  400 coins) are cosmetic and move with you when you switch phones. Spare phones keep the
  charge they had when put away. Children have no phone; one is issued at 18.
- **Coins.** Packs: 100 coins $0.99, 550 $4.99, 1,200 $9.99, 2,500 $19.99, 6,500 $49.99.
  The coin shop (phone app `store`, usable anywhere) delivers to your inventory: designer
  outfits (Atelier Nuit couture gown, Midnight couture suit, a velour tracksuit), Riviera
  designer sunglasses, a Meridian luxury chronograph, the Lyra Pro Gold Edition, phone cases.
  Coin outfits match the best dollar outfits in style; they never exceed them.
- **LivPay.** Tap to pay in any shop and on the bus; send money bank to bank. Daily limits
  reset at midnight (game time). The wallet app shows cash, bank and coin balances, the phone
  (model, battery, hours left, where it's charging, case), spare phones, LivPay's limits and
  recent activity (from the ledger), your coin purchases, the coin packs with prices, and
  whether coins can actually be bought on this server.

---

## 3. DATA_MODEL rows

Content sections (new):

| Section | Shape (abridged) | Notes |
|---|---|---|
| `coin_packs` | `[{product_id, label, coins, price_usd_cents}]` | data/economy/coins.json. `product_id` is the store product id. Coins and price must be positive; ids unique. At most one section. |
| `coin_shop` | `[{item, coin_price}]` | data/economy/coins.json. `item` must exist and be cosmetic; validation refuses anything that beats the best dollar item in its slot (or category, without a slot), and a coin phone that outlasts or out-charges the dollar phones. |
| `livpay` | `{per_transfer_limit_cents, daily_limit_cents, daily_transfers, max_note_length}` | data/economy/coins.json. Daily limit ≥ per-transfer limit. |
| `phones` | `{basic_model, low_battery_percent, charge_at_types[], models[] {item, battery_hours, charge_hours}}` | data/items/phones.json. `basic_model` is issued to every adult; every item of category `phone` needs a model; every `charge_at_types` entry must be some location's type. No section = a world without phones (nothing is gated). |
| `items` | new categories `phone` and `phone_case` | `use` on either fits it (Wallet.cpp). |

Runtime state:

| Record | Key fields |
|---|---|
| `CharacterState` | gains `phone` {model (item id), battery 0–100, phoneCase} and `spareBatteries` {model: [battery of each used spare]} (a spare with no entry is new in its box) |
| `WorldState` | gains `coins` (a `Ledger`: `coins:<character>`, `sys:coin_store`) and `coinReceipts` {receipt id: {receipt, character, product, coins, price_usd_cents, at, test, tx}} |
| `LedgerTransaction` | new kinds: `livpay`, `livpay_purchase`, `livpay_fare` (dollars); `coin_purchase`, `coin_purchase_test`, `coin_shop` (coins) |

Save keys (no new SQL; world part `wallet` in `world_parts`, character key `wallet`):

| Key | Contents |
|---|---|
| world part `wallet` | `{coins: {accounts: [{id, owner, kind, balance, allow_negative}], transactions: [{id, at, from, to, amount, kind, memo}], next_tx}, receipts: [{receipt, character, product, coins, price_usd_cents, at, test, tx}]}` |
| character `wallet` | `{phone: {model, battery, case}, spare_batteries: {model: [battery, ...]}}` |

A save without these loads as: everyone 18+ gets a full basic phone, an empty coin ledger with
its issuer, no receipts. A phone model removed from content falls back to the basic model.

---

## 4. ROADMAP bullet

- **Coins, phones and LivPay:** a premium currency in its own zero-sum ledger, credited once
  per server-verified store receipt (real store billing not connected yet: refused honestly;
  test payments on dev servers and with `--test-payments`); a cosmetic coin shop enforced by
  validation; a phone for every adult with models, battery, charging, cases and switching; a
  dead phone blocks apps and texts; LivPay tap-to-pay in shops and on the bus and bank-to-bank
  transfers with limits.

---

## 5. Protocol ops and CLI commands

| Op | Needs | Arguments |
|---|---|---|
| `buy_coins` | playing; a payment provider | `product` (coin pack `product_id`), `receipt` (the store's transaction id). Refused `payments_unavailable` on servers without one; `receipt_rejected` if the test verifier doesn't accept it; `duplicate_receipt`, `unknown_product`, `invalid_receipt`. |
| `buy_with_coins` | playing, working phone | `item`. `insufficient_coins`, `not_in_store`, `unknown_item`, `phone_dead`. |
| `switch_phone` | playing | `item` (a phone in your inventory). `not_a_phone`, `not_owned`, `already_using`, `unknown_item`. |
| `livpay_send` | playing, working phone | `to` (character id), `cents`, `note` (optional). `invalid_target` (yourself), `unknown_character`, `no_livpay` (they have no phone), `invalid_amount`, `over_limit`, `daily_limit`, `invalid_note`, `insufficient_funds`, `phone_dead`. |
| `buy` | (changed) | `method` also takes `phone` (LivPay; `phone_dead` without a working phone). |
| `ride` | (changed) | new `pay_with`: `card` (default), `cash` or `phone` (LivPay). |
| `phone` | (changed) | new apps `wallet`, `store`. Every app is refused with `phone_dead` when the battery is flat, `no_phone` without a phone. |
| `message` | (changed) | refused with `phone_dead` when your battery is flat. |
| `use` | (changed) | on a phone: switches to it; on a phone case: fits it. |

Server flag: `livera_server --test-payments` (also on with `--dev`): accept test receipts.
`ServerConfig::testPayments`.

CLI (`livera_cli`, `help` lists them):

```
wallet                      money, coins, phone battery, LivPay activity and coin packs
store                       the coin shop
buycoins PRODUCT [RECEIPT]  buy a coin pack (without RECEIPT the CLI makes a test receipt)
coinbuy ITEM                buy in the coin shop
switchphone ITEM            switch phones (`use ITEM` does the same; cases too)
livpay ID DOLLARS [NOTE]    send money with LivPay
tapride STOP                take the bus paying with LivPay
buy OFFER phone             tap to pay in a shop
```

---

## 6. What is NOT done

- **Real money.** No App Store / Google Play receipt verification, so no real purchase can
  happen; production servers refuse `buy_coins` with `payments_unavailable`. That needs the
  stores' server-side APIs, credentials and the M1 client's purchase flow. Refunds,
  chargebacks and revoking coins after a refund are not modelled. Pack prices are shown, in US
  dollars only (no regional pricing or tax).
- **Coins can't be sent or refunded in game**, by design. Items bought with coins can be given
  in person like any item (`give`); nothing in the game buys items back for dollars, so that
  can't turn coins into money.
- **Battery granularity is one game hour**: where you are at the top of the hour decides that
  hour. Spare phones in your inventory don't charge or drain. There's no portable charger,
  battery wear, or phone damage, theft or loss (pickpockets still only take cash).
- **Only phone-shaped actions are gated.** A dead phone blocks phone apps, texting, LivPay and
  the coin shop; asks that happen in person (dates, proposals), the bus by card and shopping
  by card or cash still work. Phone calls don't exist yet.
- **No LivPay requests, splitting or refunds**, and no fraud detection beyond the per-transfer
  and daily limits.
- Coin balances aren't shown in `look`; open the `wallet` app.
- The coin ledger is zero-sum by construction (it only changes through `Ledger::transfer`) and
  tested, but the SQLite store's pre-save zero-sum check covers only the dollar ledger
  (`SqliteStore.cpp` isn't this feature's file).

### Changed outside this feature's blocks (allowed edits)

- `World.cpp`: `buy` takes `method: "phone"`; `openPhoneApp` and `sendMessage` check the phone.
- `Items.cpp`: `ride` gained a `pay_with` overload; `useItem` hands phones and cases to Wallet.cpp.
- `Server.h`/`Server.cpp`: `testPayments` config, the payment verifier, `pay_with` on `ride`.
- `main.cpp`: `--test-payments`.
- `data/world/founding_town.json`: Circuit Electronics sells the Lyra One, Air, Pro and a clear case.
- `tests/test_romance.cpp`: the pregnancy test keeps Dominique online in a pharmacy for 11 game
  days, which now runs her phone flat; she charges it at home for an hour before opening the
  romance app.
