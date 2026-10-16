# M0.8 — Homes: buy houses and condos, alone or together; move in together

The product owner asked: "Partners can buy houses/condos together and move in together."

Code: `src/core/Homes.cpp` (plus small hooks listed under "Edits outside the feature's own
files"). Data: `data/world/homes_places.json`. Tests: `tests/test_homes.cpp` (12 world tests
and one over-the-network server test).

---

## 1. DECISIONS entry

## Homes are bought with real mortgages, and a home belongs to everyone who lives there
**Decision:** Eight new homes on Willow Lane (four 3-bedroom houses, $420,000–$520,000; four
2-bedroom Lakeview condos, $260,000–$320,000) are marked `for_sale` and sold at their market
value, first by their developer (Willow Lane Homes). A buyer pays at least the minimum down
payment (10%) and one lender, Livéra Savings Bank, pays the seller the rest as a mortgage
with one product in data (6% a year, 360 game months, standard amortization). The bank lends
only if your share of all your mortgage payments stays under 40% of your monthly pay (your
career level's hourly rate x 160 hours), or your savings left after the down payment cover
12 months of them; the refusal says which numbers fell short. Payments come out with the rent
on the first of the month. A payment that can't be made is owed as arrears plus a $50 late
fee; three behind and the bank forecloses: it owns the home, lists it again, and everyone who
lived there has to leave and is told why. Selling goes to the outside market at market value:
the mortgage is paid off first and the owners split the rest. Partners (dating, engaged or
married) buy together through an ask (`request kind=buy_home`): the down payment and every
monthly payment are split evenly, each must qualify for their half, and if one can't pay
their half the other covers it if they can. A home has a list of residents (adults) and of
owners; `tenant` stays as the lease holder (or an owner who lives there) for older code.
Partners move in together with an ask (`request kind=move_in`): a renter's lease ends and that
home is free for newcomers, an owner keeps what they own, and rent is split evenly between
residents. Children move with the parent they live with; the nanny's key follows the family.
**Why:** The product owner wants partners to share a home, and a home is the biggest money
decision a character makes, so it has to be real money: every cent is a `Ledger::transfer`
(down payments to the seller, the loan from the bank to the seller, payments to the bank,
sales paid by `sys:economy`), nothing is created, and missing payments has the consequence it
has in life. The 40%-of-pay-or-a-year-of-savings rule is the simplest lending rule that can
be explained in one sentence of a refusal. Rentals stay rentals; there is no landlord play.

---

## 2. SIMULATION.md section

## Homes

Houses and condos marked `for_sale` are on the market whenever no character owns them, at
their `market_value_cents`; the seller is whoever holds them (the developer at first, the
bank after a foreclosure, the market after a sale). Buying (`buy_home`, in person at the door
or inside) needs the down payment in your bank account (at least `min_down_payment` of the
price; 0 or no amount = the minimum) and, if anything is borrowed, the lender's yes: your
share of all your mortgage payments under `max_payment_share_of_pay` of your monthly pay
(career level hourly x `work_hours_per_month`), or savings after the down payment covering
`reserve_months` of them. The lender must have the cash to lend (a bank selling a home it
foreclosed on lends against it without cash changing hands). The monthly payment is the
standard amortization `P·r / (1 − (1 + r)^−n)` with `r` = annual rate / 12 and `n` =
`term_months`, fixed at purchase; each month's interest is the balance x r, and the last
payment clears the balance.

On the first of the month (`now % kMinutesPerMonth == 0`), right after rent, each mortgage
is due: this month's payment plus any arrears. Owners pay it together, split evenly; whoever
can't pay their share pays what they can and a co-owner covers the rest. If together they
can't pay it all but can pay this month's, they pay that and stay behind. If they can't pay
this month's either, nothing is taken, the payment and `late_fee_cents` are added to the
arrears and the missed count goes up; the schedule moves on regardless, so the balance plus
arrears is what's owed. Catching up (paying everything due) clears the count. At
`missed_payments_to_foreclose` the bank forecloses: it owns the home and lists it for sale,
owners and residents lose it (owners get a memory, stress and sadness), and anyone inside
who no longer has a key steps outside. A day before a payment the owners are warned if
there isn't enough between them. Paying off the last month ends the mortgage.

Rent on a rental is split evenly between its residents; whoever is short is covered by the
others if they can, otherwise each pays their own share and a share that can't be paid is
that person's rent arrears. A home holds `residents_per_bedroom` adults per bedroom (a studio
counts as one bedroom); children don't count.

Moving: buying a home moves you (and children who lived with you) in. `request kind=move_in`
(the inviter must own the home or hold its lease; both at the door or inside) moves your
partner in. Leaving a rental passes the lease to whoever still lives there, or ends it and
the home is vacant for new arrivals. Leaving a home you own keeps you an owner (`move_home`
takes you back). Selling (`sell_home` alone, or `request kind=sell_home` with a co-owner)
pays off the mortgage from the sale and splits the rest evenly; everyone who lived there
moves out. Whoever is left behind is told. Without a home you can still play (work, go out,
see people); home activities (shower, nap, cooking, housework) need a home to go to, and the
replies and the phone say so.

Children follow the parent they lived with (their `homeProperty` in `createdCharacters`): when
that parent moves, so do they, unless their other parent stays on in the old home. A parent
who leaves with nowhere to go sends them to the other parent's home if there is one. A child
inside the old home is moved into the new one at once; otherwise their hourly routine takes
them there. Care routines, supervision and the nanny's shift happen at the family's current
home, and the nanny's key is to the home their employer lives in now.

Access: residents and owners have a key (an owner who moved out can still let themselves
in); a resident's partner can come over; a child has a key to the family home while a parent
lives there; the family's nanny has a key to the employer's current home.

---

## 3. DATA_MODEL rows

Content sections (in `data/world/homes_places.json`):

| Section | Shape (abridged) | Notes |
|---|---|---|
| `properties` | gains `for_sale` (bool) | A home for sale needs `market_value_cents`, `rent_monthly_cents` 0, no `tier`, an enterable `residents` location, and can't be any character's starting home. |
| `homes` | `lender, min_down_payment, annual_rate, term_months, missed_payments_to_foreclose, late_fee_cents, max_payment_share_of_pay, work_hours_per_month, reserve_months, residents_per_bedroom` | Exactly one when any home is for sale. `lender` must be an org account. Months are game months. |
| `org_accounts` | `org:willow_lane_homes` (developer, $250,000), `org:livera_savings_bank` (lender, $10,000,000) | Funded from `sys:economy` like every org. |

Runtime state:

| Record | Key fields |
|---|---|
| `PropertyState` | gains `residents[]` (adults who live there), `owners[]` (who bought it), `mortgage` {lender, principal, balance, payment, annual rate, term months, months left, missed payments, arrears, started at}. `tenant` = the lease holder; for an owned home, an owner who lives there (else the first owner). `owner_account` = the seller while on the market, the first owner's bank once bought. |
| `PendingRequest` | gains `subject` (the home to buy or sell together); kinds `buy_home`, `move_in`, `sell_home` |
| `createdCharacters[...].homeProperty` | now changes: a child's home follows their parents (saved in the existing `created_characters` def JSON) |

Save format: world part `homes` (table `world_parts`, schema v4; no migration):
`{"properties": {"<property id>": {"residents": [...], "owners": [...], "mortgage": {"lender",
"principal_cents", "balance_cents", "payment_cents", "annual_rate", "term_months",
"months_left", "missed_payments", "arrears_cents", "started_at"}}}}`. Only homes with
residents, owners or a mortgage are written. A save without the part (older saves, new
worlds) loads with each lease holder as the only resident. The `properties` table keeps
owner account and tenant as before. Homes keeps nothing per character (no character key).

---

## 4. ROADMAP bullet

- **Homes:** eight houses and condos for sale on Willow Lane; buy alone or with a partner
  (down payment split, mortgage split, one covers the other), real mortgages from Livéra
  Savings Bank (monthly with the rent, missed payments, late fees, foreclosure); move in
  together (lease ends, rent split, both have a key); move out, move back, sell (mortgage
  paid off, the rest split); children and the nanny's key follow the family; phone `homes`.

---

## 5. Protocol ops and CLI commands

| Op | Arguments | What it does |
|---|---|---|
| `buy_home` | `property`, `down_payment_cents` (optional; 0 or missing = the minimum) | Buy a home for sale alone, at its door or inside. Refusals: `unknown_property`, `not_for_sale` (a rental), `already_own`, `sold`, `too_far`, `bad_request` (negative, more than the price, or not a number), `down_payment_too_small`, `cant_afford`, `cant_carry` (the bank's rule, with the numbers), `bank_unavailable`, `not_allowed` (under 18). |
| `request` | `kind=buy_home`, `target`, `subject=<property>` | Ask a partner to buy a home together (both at the door). The asker's own half is checked when asking; the partner's when they say yes. Refusals as above plus `not_partners`, `already_asked`. |
| `request` | `kind=move_in`, `target` | Invite a partner to live in your home (both at the door or inside). Refusals: `not_partners`, `no_home`, `not_your_home` (you don't own it or hold the lease), `already_living_together`, `wrong_place`, `no_room`. |
| `request` | `kind=sell_home`, `target`, `subject=<property>` | Ask your co-owner to sell. Refusals: `unknown_property`, `not_owner`, `not_co_owner`, `underwater`. |
| `respond` | `request`, `accept` | Answers any of the three. A yes re-checks everything; if it can't go through, the ask is closed and the asker is told why (the bank's reasons about someone's own money go only to that person). |
| `move_out` | — | Stop living where you live. A co-owner stays an owner; a lease passes to whoever stays, or ends. Refusal: `no_home`. |
| `move_home` | `property` | Move back into a home you own, in person. Refusals: `unknown_property`, `not_owner`, `already_home`, `too_far`, `no_room`. |
| `sell_home` | `property` | Sell a home you own alone to the market at market value. Refusals: `unknown_property`, `not_owner`, `co_owned` (use the ask), `underwater`. |
| `phone` | `app=homes` | Your home (address, type, bedrooms, owners, residents, tenure; rent: monthly, your share, split, next due, your arrears; mortgage for owners: lender, payment, your share, balance, arrears, months left, missed payments, foreclosure threshold, next payment), other homes you own, listings (price, bedrooms, amenities, minimum down payment, estimated monthly payment, seller), partners you could buy with, and the bank's terms with your monthly pay and current mortgage payments. |

CLI (`livera_cli`):

```
homes                     your home, rent or mortgage, homes you own, listings and who you could buy with
buyhome HOME [DOLLARS]    buy a house or condo at its door; DOLLARS down (default: the minimum)
buywith ID HOME           ask your partner to buy it together (both at the door; they `answer`)
movein ID                 ask your partner to move in with you (both at your home)
moveout                   stop living where you live (a co-owner stays an owner)
movehome HOME             move back into a home you own
sellhome HOME             sell a home you own alone, at market value (the mortgage is paid off first)
sellwith ID HOME          ask your co-owner to sell your home together
```

---

## 6. What is NOT done (honestly)

- **One mortgage product, fixed price homes.** Market values don't move, there is no
  appraisal, no refinancing, no extra or early payments (paying it off happens only by
  selling), and arrears don't earn interest. The lender is the only bank.
- **Buying together uses the minimum down payment**, split evenly; a couple can't put more
  down together (one partner can buy alone with any down payment).
- **Co-owners must both be online and together** to sell a co-owned home (the ask needs a
  yes in person). A co-owner who never comes back blocks the sale; the other can still move
  out and keep paying their half.
- **Breaking up changes nothing about housing.** Exes keep living and owning together until
  someone moves out or they sell; there is no eviction of a resident by an owner and no
  "buy out your ex".
- **No selling to another player, no renting out a home you own, no landlord play.** Sales go
  to the outside market.
- **The home's cleanliness simulation** (`Life.cpp`) still follows one person, the home's
  `tenant` (now an owner who lives there for owned homes), not every resident.
- **The phone calendar** still shows "Rent due" (the whole rent) to the lease holder only, and
  doesn't list mortgage payments; the `homes` app shows both, with your share.
- **The nanny's key** is to the home their employer lives in. If the employer has moved out
  and the children live with the other parent, the nanny has no key there (and can't start
  a shift there).
- **A baby born to a mother with no home** is placed with the parent who has one by their
  routine, but has no key until a parent moves in somewhere (they don't walk anyway).
- **Children don't tag along in town** when their family has no home; their routine keeps
  them where they last were.
- Homes have no interiors, furniture or upgrades beyond the existing activities.

---

## Edits outside the feature's own files (all small and local)

- `Content.h` / `Content.cpp`: `PropertyDef::forSale` and the `for_sale` field in the
  `properties` parser.
- `World.h`: `PropertyState` (residents, owners, mortgage), `PendingRequest::subject`, and
  `request(..., subject = "")`.
- `World.cpp`: `canAccess` (residents and owners have keys; a resident's partner can come
  over; the nanny's key follows the employer's current home) and `chargeRent` (rent split
  through `chargeHomeRent`, then `chargeMortgages`).
- `Life.cpp`: `homeOf` returns the home you're a resident of (older state: lease holders).
- `Romance.cpp`: `request`/`respond` route `buy_home`, `move_in` and `sell_home` to Homes.cpp.
- `Family.cpp`: a child's home is `familyHomeOf` (follows the family) for supervision, the
  hourly routine and care.
- `WorldViews.cpp`: `phoneProperty` lists homes you live in or own, with tenure.
- `Server.cpp`: the `request` op passes `subject`.
