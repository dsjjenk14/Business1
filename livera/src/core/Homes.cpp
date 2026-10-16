// Homes for sale, mortgages, buying together and moving in together.
// M0.8 feature file: see docs/m08/homes.md.
//
// Who lives where is on the property. `residents` are the adults who live there, `owners` the
// characters who bought it, and `tenant` stays for older code and saves: a rental's lease
// holder, or for an owned home an owner who lives there (else the first owner). Children live
// where their homeProperty (in createdCharacters) says, and it follows their parents when they
// move.
//
// A home marked for_sale in content is sold, not rented. It is on the market whenever no
// character owns it, at its market value; whoever holds it then is paid when it sells: the
// developer at first, the bank after a foreclosure, the market (sys:economy) after a sale.
// Every cent moves by Ledger::transfer: down payments to the seller, the loan from the lender
// to the seller, payments to the lender, and a sale paid by the outside economy.
#include <algorithm>
#include <cmath>
#include <optional>
#include <utility>

#include "core/Clock.h"
#include "core/Content.h"
#include "core/Parts.h"
#include "core/World.h"

namespace livera {

namespace {

constexpr const char* kNoHomeNote =
    "You don't have a home now. You can still play: work, go out, see people. Home activities (a shower, a nap, "
    "cooking at home) wait until you buy a home or move in with a partner.";

bool has(const std::vector<CharacterId>& v, const CharacterId& id) {
  return std::find(v.begin(), v.end(), id) != v.end();
}

bool isPartner(const std::string& status) { return status == "dating" || status == "engaged" || status == "married"; }

std::string pct(double fraction) { return std::to_string(std::lround(fraction * 100)) + "%"; }

// The standard amortization formula: the fixed monthly payment that repays `principal` with
// interest in `months` equal payments.
Cents amortizedPayment(Cents principal, double annualRate, int months) {
  if (principal <= 0 || months <= 0) return 0;
  const double p = static_cast<double>(principal);
  const double r = annualRate / kMonthsPerYear;
  if (r <= 0) return static_cast<Cents>(std::ceil(p / months));
  return static_cast<Cents>(std::llround(p * r / (1.0 - std::pow(1.0 + r, -months))));
}

Cents minimumDown(const HomesConfig& H, Cents price) {
  return static_cast<Cents>(std::ceil(static_cast<double>(price) * H.minDownPayment - 1e-6));
}

// This month's interest, and the payment due on the schedule (the last one clears the balance).
Cents scheduledPayment(const MortgageState& m, Cents& interest) {
  interest = 0;
  if (m.balanceCents <= 0) return 0;
  interest = static_cast<Cents>(std::llround(static_cast<double>(m.balanceCents) * m.annualRate / kMonthsPerYear));
  if (m.monthsLeft <= 1) return m.balanceCents + interest;
  return std::min(m.paymentCents, m.balanceCents + interest);
}

// An even split; the first person takes the odd cents.
std::vector<Cents> evenShares(Cents amount, std::size_t n) {
  std::vector<Cents> out(n, 0);
  if (n == 0) return out;
  const auto count = static_cast<Cents>(n);
  for (auto& s : out) s = amount / count;
  out[0] += amount % count;
  return out;
}

// A bill split evenly: each person pays their share, or what they can of it, and the others
// cover the rest of a share if they can. `complete` = the whole bill is covered.
struct Split {
  std::vector<Cents> pay;
  std::vector<Cents> covered;  // how much of each person's share the others paid
  bool complete = false;
};

Split splitBill(Cents amount, const std::vector<Cents>& balances) {
  const std::size_t n = balances.size();
  Split s{std::vector<Cents>(n, 0), std::vector<Cents>(n, 0), false};
  const std::vector<Cents> shares = evenShares(amount, n);
  std::vector<Cents> shortBy(n, 0);
  for (std::size_t i = 0; i < n; ++i) {
    s.pay[i] = std::clamp<Cents>(balances[i], 0, shares[i]);
    shortBy[i] = shares[i] - s.pay[i];
  }
  for (std::size_t i = 0; i < n; ++i) {
    for (std::size_t j = 0; j < n && shortBy[i] > 0; ++j) {
      const Cents spare = balances[j] - s.pay[j];
      if (j == i || spare <= 0) continue;
      const Cents c = std::min(spare, shortBy[i]);
      s.pay[j] += c;
      s.covered[i] += c;
      shortBy[i] -= c;
    }
  }
  s.complete = n > 0 && std::all_of(shortBy.begin(), shortBy.end(), [](Cents x) { return x == 0; });
  return s;
}

std::string homeName(const ContentDatabase& db, const std::string& pid) {
  const PropertyDef* def = db.property(pid);
  const LocationDef* loc = def ? db.location(def->location) : nullptr;
  return loc ? loc->name : pid;
}

std::string orgName(const ContentDatabase& db, const LedgerAccountId& account) {
  if (account == kEconomyAccount) return "the market";
  for (const auto& o : db.orgAccounts()) {
    if (o.id == account) return o.name;
  }
  return account;
}

// At the door, or inside.
bool atHome(const ContentDatabase& db, const CharacterState& c, const PropertyDef& def) {
  const LocationDef* loc = db.location(def.location);
  if (!loc) return false;
  if (c.inside == loc->id) return true;
  return c.inside.empty() && distance(c.position, loc->door) <= db.sim().entryRadiusMeters;
}

// A home for sale with no owner yet.
Status listed(const PropertyState& p, const PropertyDef& def, const std::string& name, const CharacterId& buyer) {
  if (!def.forSale) return fail("not_for_sale", name + " is a rental, not for sale");
  if (has(p.owners, buyer)) return fail("already_own", "you already own " + name);
  if (!p.owners.empty()) return fail("sold", name + " has already been sold");
  return okStatus();
}

std::string plural(int n, const std::string& word) { return std::to_string(n) + " " + word + (n == 1 ? "" : "s"); }

// An owned home's `tenant` is an owner who lives there, or else the first owner. Older code
// follows it (the home's cleanliness tracks whether its tenant is in), so it should be someone
// who actually lives there when an owner does.
void syncOwnedTenant(PropertyState& p) {
  if (p.owners.empty()) return;  // a rental: the lease holder, handled where the lease changes hands
  for (const auto& id : p.owners) {
    if (has(p.residents, id)) {
      p.tenant = id;
      return;
    }
  }
  p.tenant = p.owners.front();
}

// The street address shown in the phone: the place's name, and its district when the name
// doesn't already say it.
std::string addressOf(const LocationDef& loc) {
  if (loc.district.empty() || loc.name.find(loc.district) != std::string::npos) return loc.name;
  return loc.name + ", " + loc.district;
}

}  // namespace

// ---- Content -------------------------------------------------------------------------------
Status ContentDatabase::ingestHomes(const std::string& source, const std::string& section, const Json& body,
                                    bool& handled) {
  handled = section == "homes";
  if (!handled) return okStatus();
  if (haveHomes_) return fail("content_duplicate", source + ": 'homes' defined twice");
  haveHomes_ = true;
  try {
    HomesConfig& H = homes_;
    H.lender = body.at("lender").get<std::string>();
    H.minDownPayment = body.value("min_down_payment", H.minDownPayment);
    H.annualRate = body.value("annual_rate", H.annualRate);
    H.termMonths = body.value("term_months", H.termMonths);
    H.missedPaymentsToForeclose = body.value("missed_payments_to_foreclose", H.missedPaymentsToForeclose);
    H.lateFeeCents = body.value("late_fee_cents", H.lateFeeCents);
    H.maxPaymentShareOfPay = body.value("max_payment_share_of_pay", H.maxPaymentShareOfPay);
    H.workHoursPerMonth = body.value("work_hours_per_month", H.workHoursPerMonth);
    H.reserveMonths = body.value("reserve_months", H.reserveMonths);
    H.residentsPerBedroom = body.value("residents_per_bedroom", H.residentsPerBedroom);
  } catch (const std::exception& e) {
    return fail("content_invalid", source + ": homes: " + e.what());
  }
  return okStatus();
}

Status ContentDatabase::validateHomes() const {
  bool anyForSale = false;
  for (const auto& [id, p] : properties_) {
    if (!p.forSale) continue;
    anyForSale = true;
    if (p.marketValueCents <= 0)
      return fail("content_invalid", "property " + id + ": a home for sale needs market_value_cents");
    if (p.rentMonthlyCents != 0)
      return fail("content_invalid", "property " + id + ": a home for sale isn't rented (rent_monthly_cents 0)");
    // New arrivals are housed in vacant homes of their origin's tier: never in one that's for sale.
    if (!p.tier.empty())
      return fail("content_invalid", "property " + id + ": a home for sale has no tier (new arrivals rent)");
    const LocationDef* loc = location(p.location);
    if (loc && (!loc->enterable || loc->access != AccessRule::Residents))
      return fail("content_invalid", "property " + id + ": a home for sale must be an enterable, residents-only place");
    for (const auto& [cid, c] : characters_) {
      if (c.homeProperty == id)
        return fail("content_invalid",
                    "character " + cid + ": starts in " + id + ", which is for sale (start them in a rental)");
    }
  }
  if (!haveHomes_) {
    if (anyForSale) return fail("content_invalid", "homes for sale need a 'homes' section (the lender and its terms)");
    return okStatus();
  }
  const HomesConfig& H = homes_;
  const bool lender =
      std::any_of(orgAccounts_.begin(), orgAccounts_.end(), [&](const OrgAccountDef& o) { return o.id == H.lender; });
  if (!lender) return fail("content_invalid", "homes.lender must be an org account");
  if (H.minDownPayment <= 0 || H.minDownPayment > 1)
    return fail("content_invalid", "homes.min_down_payment must be in (0, 1]");
  if (H.annualRate < 0 || H.annualRate > 1) return fail("content_invalid", "homes.annual_rate must be 0-1");
  if (H.termMonths < 1) return fail("content_invalid", "homes.term_months must be at least 1");
  if (H.missedPaymentsToForeclose < 1)
    return fail("content_invalid", "homes.missed_payments_to_foreclose must be at least 1");
  if (H.lateFeeCents < 0) return fail("content_invalid", "homes.late_fee_cents can't be negative");
  if (H.maxPaymentShareOfPay <= 0 || H.maxPaymentShareOfPay > 1)
    return fail("content_invalid", "homes.max_payment_share_of_pay must be in (0, 1]");
  if (H.workHoursPerMonth <= 0) return fail("content_invalid", "homes.work_hours_per_month must be positive");
  if (H.reserveMonths < 0) return fail("content_invalid", "homes.reserve_months can't be negative");
  if (H.residentsPerBedroom < 1) return fail("content_invalid", "homes.residents_per_bedroom must be at least 1");
  return okStatus();
}

// ---- Who lives where -----------------------------------------------------------------------
std::vector<CharacterId> World::residentsOf(const PropertyState& p) const {
  if (p.residents.empty() && p.owners.empty() && !p.tenant.empty()) return {p.tenant};
  return p.residents;
}

bool World::hasKey(const PropertyState& p, const CharacterId& id) const {
  if (id.empty()) return false;
  if (p.tenant == id || has(p.residents, id) || has(p.owners, id)) return true;
  // A child lives in the family home their parents moved them to.
  auto def = state_.createdCharacters.find(id);
  const CharacterState* c = character(id);
  if (def == state_.createdCharacters.end() || !c || def->second.homeProperty != p.id) return false;
  const auto living = residentsOf(p);
  return std::any_of(c->parents.begin(), c->parents.end(),
                     [&](const CharacterId& parent) { return has(living, parent); });
}

const PropertyDef* World::familyHomeOf(const CharacterState& child) const {
  const CharacterDef* def = definition(child.id);
  if (def && !def->homeProperty.empty()) {
    auto it = state_.properties.find(def->homeProperty);
    bool anyParent = false;
    bool parentThere = false;
    for (const auto& parent : child.parents) {
      if (!character(parent)) continue;
      anyParent = true;
      parentThere = parentThere || (it != state_.properties.end() && has(residentsOf(it->second), parent));
    }
    if (it != state_.properties.end() && (parentThere || !anyParent)) return content_->property(def->homeProperty);
  }
  // Their parents have moved on without them being moved (an older save, or no home in
  // between): they're wherever a parent lives now.
  for (const auto& parent : child.parents) {
    if (const PropertyState* home = homeOf(parent)) return content_->property(home->id);
  }
  return nullptr;
}

bool World::roomFor(const PropertyState& p, const PropertyDef& def) const {
  const int capacity = std::max(1, def.bedrooms) * content_->homes().residentsPerBedroom;
  return static_cast<int>(residentsOf(p).size()) + 1 <= capacity;
}

Json World::leaveHome(const CharacterId& id, PropertyState& from, PropertyState* to) {
  if (from.residents.empty() && from.owners.empty() && from.tenant == id) from.residents.push_back(id);  // older state
  from.residents.erase(std::remove(from.residents.begin(), from.residents.end(), id), from.residents.end());
  Json out{{"left", from.id}, {"name", homeName(*content_, from.id)}, {"still_own", has(from.owners, id)}};
  // A lease passes to whoever still lives there, or ends; an owned home stays its owners'.
  if (from.owners.empty() && from.tenant == id) {
    from.tenant = from.residents.empty() ? "" : from.residents.front();
    out["lease"] = from.tenant.empty() ? "ended" : "passed to " + from.tenant;
  }
  syncOwnedTenant(from);
  // Children who lived here with them come along, unless their other parent stays on. With
  // nowhere to go, a child goes to their other parent's home if they have one.
  const PropertyDef* fromDef = content_->property(from.id);
  Json children = Json::array();
  for (auto& [cid, def] : state_.createdCharacters) {
    CharacterState* kid = mutableCharacter(cid);
    if (!kid || def.homeProperty != from.id || !has(kid->parents, id) || homeOf(cid)) continue;
    const bool otherParentStays = std::any_of(kid->parents.begin(), kid->parents.end(),
                                              [&](const CharacterId& p) { return p != id && has(from.residents, p); });
    if (otherParentStays) continue;
    const PropertyState* dest = to;
    for (const auto& parent : kid->parents) {
      if (!dest && parent != id) dest = homeOf(parent);
    }
    const PropertyDef* toDef = dest ? content_->property(dest->id) : nullptr;
    def.homeProperty = toDef ? toDef->id : "";
    children.push_back(cid);
    if (fromDef && kid->inside == fromDef->location) {
      const LocationDef* place = toDef ? content_->location(toDef->location) : nullptr;
      const LocationDef* old = content_->location(fromDef->location);
      kid->inside = place ? place->id : "";
      if (place)
        kid->position = place->door;
      else if (old)
        kid->position = old->door;
    }
  }
  if (!children.empty()) out["children"] = children;
  if (fromDef) showOut(*fromDef);
  return out;
}

Json World::moveIn(const CharacterId& id, PropertyState& to, const std::vector<CharacterId>& movingToo) {
  PropertyState* from = homeOf(id);
  if (from == &to) return Json();
  Json left = from ? leaveHome(id, *from, &to) : Json();
  if (from) {
    // Whoever still lives there hears about it (not someone moving to the same place with them).
    const CharacterDef* d = definition(id);
    for (const auto& other : residentsOf(*from)) {
      if (has(movingToo, other)) continue;
      notify(other, "home",
             (d ? d->firstName : id) + " moved out of " + homeName(*content_, from->id) + " to live at " +
                 homeName(*content_, to.id) + "." +
                 (left.value("lease", "") == "passed to " + other ? " The lease is yours now." : ""));
    }
  }
  if (to.residents.empty() && to.owners.empty() && !to.tenant.empty())
    to.residents.push_back(to.tenant);  // older state
  to.residents.push_back(id);
  if (to.tenant.empty()) to.tenant = id;  // the first to live in a rental holds the lease
  syncOwnedTenant(to);
  // Children of theirs with no family home (no parent lives where they were) come along too.
  for (auto& [cid, def] : state_.createdCharacters) {
    const CharacterState* kid = character(cid);
    if (!kid || !has(kid->parents, id) || homeOf(cid)) continue;
    auto was = state_.properties.find(def.homeProperty);
    const bool parentThere = was != state_.properties.end() &&
                             std::any_of(kid->parents.begin(), kid->parents.end(),
                                         [&](const CharacterId& p) { return has(residentsOf(was->second), p); });
    if (!parentThere) def.homeProperty = to.id;
  }
  return left;
}

// People inside who no longer have a key (or a resident partner) step outside.
void World::showOut(const PropertyDef& def) {
  const LocationDef* loc = content_->location(def.location);
  if (!loc) return;
  for (auto& [id, c] : state_.characters) {
    if (c.inside != loc->id || canAccess(id, *loc)) continue;
    if (c.online && exitBuilding(id)) continue;
    c.inside.clear();
    c.position = loc->door;
  }
}

Cents World::mortgageShareOf(const CharacterId& id) const {
  Cents total = 0;
  for (const auto& [pid, p] : state_.properties) {
    if (p.mortgage && has(p.owners, id)) total += p.mortgage->paymentCents / static_cast<Cents>(p.owners.size());
  }
  return total;
}

Cents World::monthlyPayOf(const CharacterState& c) const {
  const CareerDef* career = content_->career(c.career.careerId);
  if (!career || c.career.level < 0 || c.career.level >= static_cast<int>(career->levels.size())) return 0;
  const double hourly = static_cast<double>(career->levels[static_cast<std::size_t>(c.career.level)].hourlyCents);
  return static_cast<Cents>(std::llround(hourly * content_->homes().workHoursPerMonth));
}

// ---- Buying ---------------------------------------------------------------------------------
// Will the bank lend to this buyer: the down payment in the bank, and payments they can carry.
Status World::checkBuyer(const CharacterState& c, Cents downShare, Cents paymentShare, bool together) const {
  const HomesConfig& H = content_->homes();
  if (ageOf(c.id) < content_->life().adultAge) return fail("not_allowed", "only adults can buy a home");
  const Cents bank = state_.ledger.balance(bankAccountOf(c.id));
  if (bank < downShare)
    return fail("cant_afford", "you need " + formatMoney(downShare) + " in the bank for " +
                                   (together ? "your half of " : "") + "the down payment, and you have " +
                                   formatMoney(bank));
  if (paymentShare <= 0) return okStatus();
  const Cents carried = mortgageShareOf(c.id) + paymentShare;
  const Cents pay = monthlyPayOf(c);
  const auto limit = static_cast<Cents>(std::llround(static_cast<double>(pay) * H.maxPaymentShareOfPay));
  const Cents reserve = carried * H.reserveMonths;
  if (carried <= limit || bank - downShare >= reserve) return okStatus();
  return fail("cant_carry",
              "the bank won't lend: " + std::string(together ? "your half of the payments" : "the payments") + " (" +
                  formatMoney(carried) + " a month" +
                  (carried > paymentShare ? " with the mortgage you already have" : "") + ") must be under " +
                  pct(H.maxPaymentShareOfPay) + " of your pay (" + formatMoney(pay) +
                  " a month at your job), or your savings after the down payment must cover " +
                  std::to_string(H.reserveMonths) + " months of them (" + formatMoney(reserve) + ")");
}

Result<Json> World::buyHome(const CharacterId& actor, const std::string& property, Cents downPaymentCents) {
  auto r = activeCharacter(actor);
  if (!r) return r.error();
  CharacterState& c = *r.value();
  if (Status st = freeToAct(c); !st) return st.error();
  auto it = state_.properties.find(property);
  const PropertyDef* def = content_->property(property);
  if (it == state_.properties.end() || !def)
    return fail("unknown_property", "no such home (phone homes lists the ones for sale)");
  const std::string name = homeName(*content_, property);
  if (Status st = listed(it->second, *def, name, actor); !st) return st.error();
  if (!atHome(*content_, c, *def)) return fail("too_far", "you buy a home in person: go to " + name + " first");
  const HomesConfig& H = content_->homes();
  const Cents price = def->marketValueCents;
  const Cents minDown = minimumDown(H, price);
  if (downPaymentCents < 0) return fail("bad_request", "a down payment can't be negative");
  const Cents down = downPaymentCents == 0 ? minDown : downPaymentCents;
  if (down < minDown)
    return fail("down_payment_too_small",
                "the bank needs at least " + pct(H.minDownPayment) + " down: " + formatMoney(minDown));
  if (down > price) return fail("bad_request", "that's more than the price, " + formatMoney(price));
  const Cents payment = amortizedPayment(price - down, H.annualRate, H.termMonths);
  if (Status st = checkBuyer(c, down, payment, false); !st) return st.error();
  return closePurchase({actor}, {down}, it->second, *def);
}

// Money first (all of it checked before any of it moves), then the keys.
Result<Json> World::closePurchase(const std::vector<CharacterId>& buyers, const std::vector<Cents>& downShares,
                                  PropertyState& p, const PropertyDef& def) {
  const HomesConfig& H = content_->homes();
  const std::string name = homeName(*content_, p.id);
  const Cents price = def.marketValueCents;
  Cents down = 0;
  for (Cents d : downShares) down += d;
  const Cents loan = price - down;
  const LedgerAccountId seller = p.ownerAccount;
  if (!state_.ledger.account(seller)) return fail("unavailable", name + " has no seller to pay");
  if (loan > 0 && seller != H.lender && state_.ledger.balance(H.lender) < loan)
    return fail("bank_unavailable", orgName(*content_, H.lender) + " can't lend that much right now");
  for (std::size_t i = 0; i < buyers.size(); ++i) {
    if (state_.ledger.balance(bankAccountOf(buyers[i])) < downShares[i])
      return fail("cant_afford", "the down payment didn't go through");
  }
  for (std::size_t i = 0; i < buyers.size(); ++i) {
    if (downShares[i] <= 0) continue;
    auto tx = state_.ledger.transfer(bankAccountOf(buyers[i]), seller, downShares[i], "home_purchase",
                                     "Down payment: " + name, state_.now);
    if (!tx) return tx.error();
  }
  // The lender pays the seller the rest. A bank selling a home it took back lends against it.
  if (loan > 0 && seller != H.lender) {
    auto tx = state_.ledger.transfer(H.lender, seller, loan, "mortgage", "Mortgage on " + name, state_.now);
    if (!tx) return tx.error();
  }
  p.owners = buyers;
  p.tenant = buyers.front();
  p.ownerAccount = bankAccountOf(buyers.front());
  p.mortgage.reset();
  Json out{{"bought", p.id}, {"name", name}, {"price_cents", price}, {"down_payment_cents", down}};
  if (loan > 0) {
    MortgageState m;
    m.lender = H.lender;
    m.principalCents = m.balanceCents = loan;
    m.paymentCents = amortizedPayment(loan, H.annualRate, H.termMonths);
    m.annualRate = H.annualRate;
    m.termMonths = m.monthsLeft = H.termMonths;
    m.startedAt = state_.now;
    p.mortgage = m;
    out["mortgage"] = Json{{"lender", orgName(*content_, m.lender)},
                           {"principal_cents", loan},
                           {"payment_cents", m.paymentCents},
                           {"payment_share_cents", evenShares(m.paymentCents, buyers.size()).back()},
                           {"annual_rate", m.annualRate},
                           {"term_months", m.termMonths},
                           {"first_payment", formatDateTime((state_.now / kMinutesPerMonth + 1) * kMinutesPerMonth)}};
  } else {
    out["mortgage"] = nullptr;
    out["owned_outright"] = true;
  }
  Json owners = Json::array();
  Json moves = Json::object();
  for (const auto& id : buyers) {
    const CharacterDef* d = definition(id);
    owners.push_back(Json{{"id", id}, {"name", d ? d->fullName() : id}});
    moves[id] = moveIn(id, p, buyers);
  }
  syncOwnedTenant(p);
  out["owners"] = owners;
  out["moved"] = moves;
  // A day to remember.
  for (const auto& id : buyers) {
    CharacterState* c = mutableCharacter(id);
    if (c) applyEmotions(*c, {{"happiness", 20}, {"excitement", 15}});
    Memory m;
    m.id = nextId("mem");
    m.owner = id;
    m.at = state_.now;
    m.participants = buyers;
    m.location = def.location;
    m.type = "bought_home";
    m.importance = 80;
    m.emotionalImpact = 70;
    m.info = "Bought " + name;
    for (const auto& other : buyers) {
      if (other == id) continue;
      const CharacterDef* d = definition(other);
      m.info += " with " + (d ? d->firstName : other);
      m.about = other;
    }
    m.isPublic = true;
    addMemory(std::move(m));
  }
  return out;
}

// ---- Selling and losing a home -------------------------------------------------------------
// The market buys at market value: the lender is paid off first and the owners split the rest.
Result<Json> World::completeSale(PropertyState& p, const PropertyDef& def) {
  const std::string name = homeName(*content_, p.id);
  const Cents price = def.marketValueCents;
  const Cents payoff = p.mortgage ? p.mortgage->balanceCents + p.mortgage->arrearsCents : 0;
  if (price < payoff)
    return fail("underwater", "you owe " + formatMoney(payoff) + " on " + name + ", more than it would sell for (" +
                                  formatMoney(price) + ")");
  if (payoff > 0) {
    auto tx = state_.ledger.transfer(kEconomyAccount, p.mortgage->lender, payoff, "mortgage_payoff",
                                     "Mortgage paid off: " + name, state_.now);
    if (!tx) return tx.error();
  }
  const std::vector<CharacterId> owners = p.owners;
  const std::vector<Cents> shares = evenShares(price - payoff, owners.size());
  Json proceeds = Json::object();
  for (std::size_t i = 0; i < owners.size(); ++i) {
    if (shares[i] > 0)
      (void)state_.ledger.transfer(kEconomyAccount, bankAccountOf(owners[i]), shares[i], "home_sale", "Sale of " + name,
                                   state_.now);
    proceeds[owners[i]] = shares[i];
  }
  const std::vector<CharacterId> living = residentsOf(p);
  for (const auto& id : living) (void)leaveHome(id, p, nullptr);
  p.owners.clear();
  p.residents.clear();
  p.tenant.clear();
  p.mortgage.reset();
  p.ownerAccount = kEconomyAccount;  // back on the market
  showOut(def);
  for (const auto& id : living) {
    if (!has(owners, id)) notify(id, "home", name + " has been sold, and you've had to move out. " + kNoHomeNote);
  }
  return Json{{"sold", p.id},
              {"name", name},
              {"price_cents", price},
              {"mortgage_paid_off_cents", payoff},
              {"proceeds_cents", proceeds}};
}

void World::foreclose(PropertyState& p, const PropertyDef& def) {
  const HomesConfig& H = content_->homes();
  const std::string name = homeName(*content_, p.id);
  const LedgerAccountId lender = p.mortgage ? p.mortgage->lender : H.lender;
  const std::string bank = orgName(*content_, lender);
  const int missed = p.mortgage ? p.mortgage->missedPayments : H.missedPaymentsToForeclose;
  const std::vector<CharacterId> owners = p.owners;
  const std::vector<CharacterId> living = residentsOf(p);
  for (const auto& id : living) (void)leaveHome(id, p, nullptr);
  // The bank takes the home in place of the debt, and lists it.
  p.owners.clear();
  p.residents.clear();
  p.tenant.clear();
  p.mortgage.reset();
  p.ownerAccount = lender;
  showOut(def);
  for (const auto& id : owners) {
    notify(id, "home",
           bank + " foreclosed on " + name + " after " + plural(missed, "missed mortgage payment") +
               ". It's the bank's now, and back on the market." +
               (has(living, id) ? std::string(" ") + kNoHomeNote : ""));
    if (CharacterState* c = mutableCharacter(id))
      applyEmotions(*c, {{"stress", 30}, {"sadness", 20}, {"happiness", -15}});
    Memory m;
    m.id = nextId("mem");
    m.owner = id;
    m.at = state_.now;
    m.participants = owners;
    m.location = def.location;
    m.type = "foreclosure";
    m.importance = 85;
    m.emotionalImpact = -75;
    m.info = "Lost " + name + " to foreclosure";
    addMemory(std::move(m));
  }
  for (const auto& id : living) {
    if (!has(owners, id))
      notify(id, "home", bank + " foreclosed on " + name + ", and you've had to move out. " + kNoHomeNote);
  }
}

Result<Json> World::sellHome(const CharacterId& actor, const std::string& property) {
  auto r = activeCharacter(actor);
  if (!r) return r.error();
  if (Status st = freeToAct(*r.value()); !st) return st.error();
  auto it = state_.properties.find(property);
  const PropertyDef* def = content_->property(property);
  if (it == state_.properties.end() || !def) return fail("unknown_property", "no such home");
  PropertyState& p = it->second;
  const std::string name = homeName(*content_, property);
  if (!has(p.owners, actor)) return fail("not_owner", "you don't own " + name);
  if (p.owners.size() > 1) {
    const CharacterId other = p.owners.front() == actor ? p.owners.back() : p.owners.front();
    const CharacterDef* d = definition(other);
    return fail("co_owned", "you own " + name + " with " + (d ? d->firstName : other) +
                                ": ask them (request kind=sell_home target=" + other + " subject=" + property + ")");
  }
  auto sold = completeSale(p, *def);
  if (!sold) return sold.error();
  Json out = sold.value();
  out["your_share_cents"] = out["proceeds_cents"].value(actor, Cents{0});
  if (!homeOf(actor)) out["note"] = kNoHomeNote;
  return out;
}

// ---- Moving ---------------------------------------------------------------------------------
Result<Json> World::moveOut(const CharacterId& actor) {
  auto r = activeCharacter(actor);
  if (!r) return r.error();
  if (Status st = freeToAct(*r.value()); !st) return st.error();
  PropertyState* home = homeOf(actor);
  if (!home) return fail("no_home", "you don't live anywhere right now");
  const std::string name = homeName(*content_, home->id);
  Json out = leaveHome(actor, *home, nullptr);
  const CharacterDef* me = definition(actor);
  for (const auto& id : residentsOf(*home)) {
    notify(id, "home",
           (me ? me->firstName : actor) + " moved out of " + name + "." +
               (out.value("lease", "") == "passed to " + id ? " The lease is yours now." : ""));
  }
  out["note"] = std::string(kNoHomeNote) + (out.value("still_own", false) ? " You still own " + name + ": move_home " +
                                                                                home->id + " to live there again."
                                                                          : "");
  return out;
}

Result<Json> World::moveHome(const CharacterId& actor, const std::string& property) {
  auto r = activeCharacter(actor);
  if (!r) return r.error();
  CharacterState& c = *r.value();
  if (Status st = freeToAct(c); !st) return st.error();
  auto it = state_.properties.find(property);
  const PropertyDef* def = content_->property(property);
  if (it == state_.properties.end() || !def) return fail("unknown_property", "no such home");
  PropertyState& p = it->second;
  const std::string name = homeName(*content_, property);
  if (!has(p.owners, actor)) return fail("not_owner", "you don't own " + name);
  if (homeOf(actor) == &p) return fail("already_home", "you already live at " + name);
  if (!atHome(*content_, c, *def)) return fail("too_far", "go to " + name + " first");
  if (!roomFor(p, *def)) return fail("no_room", name + " has no room for anyone else");
  Json left = moveIn(actor, p);
  return Json{{"moved_into", property}, {"name", name}, {"left", left}};
}

// ---- Asks that need the other person's yes (from Romance.cpp) --------------------------------
Result<std::string> World::homeAsk(const CharacterState& a, const CharacterState& t, const std::string& kind,
                                   const std::string& subject) {
  const HomesConfig& H = content_->homes();
  const CharacterDef* me = definition(a.id);
  const std::string name = me ? me->firstName : a.id;
  const std::string status = relationshipStatus(a.id, t.id);
  if (kind == "move_in") {
    if (!isPartner(status))
      return fail("not_partners", "you can ask a partner (dating, engaged or married) to move in");
    const PropertyState* home = homeOf(a.id);
    const PropertyDef* def = home ? content_->property(home->id) : nullptr;
    if (!def) return fail("no_home", "you don't have a home to invite them to");
    const std::string where = homeName(*content_, home->id);
    if (!has(home->owners, a.id) && home->tenant != a.id)
      return fail("not_your_home", "only an owner or the lease holder can ask someone to live at " + where);
    if (has(residentsOf(*home), t.id)) return fail("already_living_together", "you already live together");
    if (!atHome(*content_, a, *def) || !atHome(*content_, t, *def))
      return fail("wrong_place", "you both need to be at " + where);
    if (!roomFor(*home, *def)) return fail("no_room", where + " has no room for anyone else");
    std::string text = name + " is asking you to move in together at " + where + ".";
    if (const PropertyState* mine = homeOf(t.id)) {
      const std::string current = homeName(*content_, mine->id);
      if (has(mine->owners, t.id))
        text += " You'd keep owning " + current + ".";
      else if (mine->tenant == t.id)
        text += " Your lease on " + current + " would end" +
                (residentsOf(*mine).size() > 1 ? " (it passes to whoever stays)." : ".");
    }
    if (def->rentMonthlyCents > 0)
      text += " The rent, " + formatMoney(def->rentMonthlyCents) + " a month, would be split " +
              std::to_string(residentsOf(*home).size() + 1) + " ways.";
    return text;
  }
  auto it = state_.properties.find(subject);
  const PropertyDef* def = content_->property(subject);
  if (subject.empty() || it == state_.properties.end() || !def)
    return fail("unknown_property", "which home? Send its id as subject (phone homes lists them)");
  const PropertyState& p = it->second;
  const std::string where = homeName(*content_, subject);
  if (kind == "buy_home") {
    if (!isPartner(status))
      return fail("not_partners", "you buy a home together with a partner (dating, engaged or married)");
    if (Status st = listed(p, *def, where, a.id); !st) return st.error();
    if (has(p.owners, t.id)) return fail("sold", where + " has already been sold");
    if (!atHome(*content_, a, *def) || !atHome(*content_, t, *def))
      return fail("too_far", "you both need to be at " + where);
    const Cents price = def->marketValueCents;
    const std::vector<Cents> downs = evenShares(minimumDown(H, price), 2);
    const std::vector<Cents> pays =
        evenShares(amortizedPayment(price - downs[0] - downs[1], H.annualRate, H.termMonths), 2);
    if (Status st = checkBuyer(a, downs[0], pays[0], true); !st) return st.error();
    return name + " wants to buy " + where + " with you: " + formatMoney(price) + ", " + formatMoney(downs[1]) +
           " down each and about " + formatMoney(pays[1]) + " a month each on the mortgage.";
  }
  // sell_home
  if (!has(p.owners, a.id)) return fail("not_owner", "you don't own " + where);
  if (!has(p.owners, t.id)) return fail("not_co_owner", "they don't own " + where + " with you");
  const Cents price = def->marketValueCents;
  const Cents payoff = p.mortgage ? p.mortgage->balanceCents + p.mortgage->arrearsCents : 0;
  if (price < payoff) return fail("underwater", "you owe more on " + where + " than it would sell for");
  const std::vector<Cents> shares = evenShares(price - payoff, p.owners.size());
  return name + " wants to sell " + where + " for " + formatMoney(price) + ": after paying off the mortgage (" +
         formatMoney(payoff) + "), you'd get " + formatMoney(shares.back()) + ".";
}

// A yes that can't go through still closes the ask, and the asker hears why. The bank's
// reasons are about someone's own money, so for those settleHomeAsk tells each side only
// their own.
Result<Json> World::homeAnswer(const PendingRequest& q, CharacterState& from, CharacterState& me) {
  auto done = settleHomeAsk(q, from, me);
  if (!done && done.error().code != "cant_afford" && done.error().code != "cant_carry") {
    const CharacterDef* myDef = definition(me.id);
    notify(from.id, "home",
           (myDef ? myDef->firstName : me.id) + " said yes, but it couldn't go through: " + done.error().message + ".");
  }
  return done;
}

Result<Json> World::settleHomeAsk(const PendingRequest& q, CharacterState& from, CharacterState& me) {
  const HomesConfig& H = content_->homes();
  const CharacterDef* fromDef = definition(from.id);
  const CharacterDef* myDef = definition(me.id);
  const std::string fromName = fromDef ? fromDef->firstName : from.id;
  const std::string myName = myDef ? myDef->firstName : me.id;
  if (q.kind == "move_in") {
    if (!isPartner(relationshipStatus(from.id, me.id))) return fail("not_partners", "you're not together anymore");
    PropertyState* home = homeOf(from.id);
    const PropertyDef* def = home ? content_->property(home->id) : nullptr;
    if (!def) return fail("no_home", fromName + " doesn't have a home to move into anymore");
    const std::string where = homeName(*content_, home->id);
    if (!has(home->owners, from.id) && home->tenant != from.id)
      return fail("not_your_home", fromName + " no longer owns or holds the lease on " + where);
    if (has(residentsOf(*home), me.id)) return fail("already_living_together", "you already live together");
    if (!atHome(*content_, from, *def) || !atHome(*content_, me, *def))
      return fail("wrong_place", "you both need to be at " + where);
    if (!roomFor(*home, *def)) return fail("no_room", where + " has no room for anyone else");
    Json left = moveIn(me.id, *home);
    for (auto [owner, other] : {std::pair{from.id, me.id}, std::pair{me.id, from.id}}) {
      Memory m;
      m.id = nextId("mem");
      m.owner = owner;
      m.at = state_.now;
      m.participants = {from.id, me.id};
      m.location = def->location;
      m.type = "moved_in_together";
      m.importance = 70;
      m.emotionalImpact = 55;
      m.about = other;
      m.info = "Moved in together at " + where;
      m.isPublic = true;
      addMemory(std::move(m));
      adjustRelationship(owner, other, "familiarity", 5);
      adjustRelationship(owner, other, "trust", 3);
    }
    applyEmotions(from, {{"happiness", 10}, {"excitement", 10}});
    applyEmotions(me, {{"happiness", 10}, {"excitement", 10}});
    notify(from.id, "home", myName + " moved in with you at " + where + ".");
    const std::vector<CharacterId> living = residentsOf(*home);
    Json out{{"moved_in", home->id}, {"name", where}, {"with", from.id}, {"left", left}, {"residents", living}};
    if (def->rentMonthlyCents > 0) {
      out["rent_monthly_cents"] = def->rentMonthlyCents;
      out["rent_share_cents"] = evenShares(def->rentMonthlyCents, living.size()).back();
    }
    return out;
  }
  auto it = state_.properties.find(q.subject);
  const PropertyDef* def = content_->property(q.subject);
  if (it == state_.properties.end() || !def) return fail("unknown_property", "no such home");
  PropertyState& p = it->second;
  const std::string where = homeName(*content_, q.subject);
  if (q.kind == "buy_home") {
    if (!isPartner(relationshipStatus(from.id, me.id))) return fail("not_partners", "you're not together anymore");
    if (Status st = listed(p, *def, where, me.id); !st) return st.error();
    if (!atHome(*content_, from, *def) || !atHome(*content_, me, *def))
      return fail("too_far", "you both need to be at " + where);
    const Cents price = def->marketValueCents;
    const std::vector<Cents> downs = evenShares(minimumDown(H, price), 2);
    const std::vector<Cents> pays =
        evenShares(amortizedPayment(price - downs[0] - downs[1], H.annualRate, H.termMonths), 2);
    const std::string turnedDown = "The bank turned down your joint purchase of " + where + ": ";
    if (Status st = checkBuyer(me, downs[1], pays[1], true); !st) {
      notify(from.id, "home", turnedDown + myName + " couldn't cover their half.");
      return st.error();
    }
    if (Status st = checkBuyer(from, downs[0], pays[0], true); !st) {
      notify(from.id, "home", turnedDown + st.error().message + ".");
      return fail(st.error().code, "the bank turned it down: " + fromName + " can't cover their half anymore");
    }
    auto bought = closePurchase({from.id, me.id}, downs, p, *def);
    if (!bought) return bought.error();
    notify(from.id, "home", "You and " + myName + " bought " + where + ". Welcome home.");
    return bought.value();
  }
  // sell_home
  if (!has(p.owners, from.id) || !has(p.owners, me.id))
    return fail("not_co_owner", "you don't own " + where + " together anymore");
  auto sold = completeSale(p, *def);
  if (!sold) return sold.error();
  Json out = sold.value();
  const Cents mine = out["proceeds_cents"].value(me.id, Cents{0});
  const Cents theirs = out["proceeds_cents"].value(from.id, Cents{0});
  out["your_share_cents"] = mine;
  notify(from.id, "home",
         where + " is sold. Your share, " + formatMoney(theirs) + ", is in your bank account." +
             (homeOf(from.id) ? "" : std::string(" ") + kNoHomeNote));
  if (!homeOf(me.id)) out["note"] = kNoHomeNote;
  return out;
}

// ---- The first of the month (from chargeRent) -------------------------------------------------
void World::chargeHomeRent(PropertyState& p, const PropertyDef& def) {
  std::vector<CharacterId> payers;
  for (const auto& id : residentsOf(p)) {
    if (character(id)) payers.push_back(id);
  }
  if (payers.empty()) return;
  const Cents rent = def.rentMonthlyCents;
  const std::string memo = "Rent: " + homeName(*content_, p.id);
  const std::vector<Cents> shares = evenShares(rent, payers.size());
  std::vector<Cents> balances;
  for (const auto& id : payers) balances.push_back(state_.ledger.balance(bankAccountOf(id)));
  const Split split = splitBill(rent, balances);
  auto firstName = [&](const CharacterId& id) {
    const CharacterDef* d = definition(id);
    return d ? d->firstName : id;
  };
  if (split.complete) {
    for (std::size_t i = 0; i < payers.size(); ++i) {
      if (split.pay[i] > 0)
        (void)state_.ledger.transfer(bankAccountOf(payers[i]), p.ownerAccount, split.pay[i], "rent", memo, state_.now);
      std::string text = "Rent of " + formatMoney(rent) + " paid.";
      if (payers.size() > 1) text += " Your share: " + formatMoney(shares[i]) + ".";
      for (std::size_t j = 0; j < payers.size() && split.covered[i] > 0; ++j) {
        if (split.pay[j] > shares[j]) {
          text += " " + firstName(payers[j]) + " covered " + formatMoney(split.covered[i]) + " of it.";
          break;
        }
      }
      if (split.pay[i] > shares[i])
        text += " You covered " + formatMoney(split.pay[i] - shares[i]) + " for the household.";
      notify(payers[i], "bank", text);
    }
    return;
  }
  // Together they can't make it: whoever can pays their own share, and the rest is owed.
  for (std::size_t i = 0; i < payers.size(); ++i) {
    CharacterState* c = mutableCharacter(payers[i]);
    const std::string what =
        payers.size() == 1 ? "Rent of " + formatMoney(rent) : "Your share of the rent, " + formatMoney(shares[i]) + ",";
    if (state_.ledger.transfer(bankAccountOf(payers[i]), p.ownerAccount, shares[i], "rent", memo, state_.now)) {
      notify(payers[i], "bank", what + (payers.size() == 1 ? " paid." : " was paid."));
    } else {
      c->rentArrearsCents += shares[i];
      notify(payers[i], "bank", what + " is overdue. Total owed: " + formatMoney(c->rentArrearsCents) + ".");
    }
  }
}

void World::chargeMortgages() {
  const HomesConfig& H = content_->homes();
  std::vector<std::string> foreclosures;
  for (auto& [pid, p] : state_.properties) {
    if (!p.mortgage) continue;
    MortgageState& m = *p.mortgage;
    std::vector<CharacterId> owners;
    for (const auto& id : p.owners) {
      if (character(id)) owners.push_back(id);
    }
    if (owners.empty()) continue;
    const std::string name = homeName(*content_, pid);
    const std::string memo = "Mortgage: " + name;
    Cents interest = 0;
    const Cents scheduled = scheduledPayment(m, interest);
    // All or nothing: the owners together pay the amount, split evenly and covering each other.
    auto pay = [&](Cents amount) -> std::optional<Split> {
      std::vector<Cents> balances;
      for (const auto& id : owners) balances.push_back(state_.ledger.balance(bankAccountOf(id)));
      Split s = splitBill(amount, balances);
      if (!s.complete) return std::nullopt;
      for (std::size_t i = 0; i < owners.size(); ++i) {
        if (s.pay[i] > 0)
          (void)state_.ledger.transfer(bankAccountOf(owners[i]), m.lender, s.pay[i], "mortgage", memo, state_.now);
      }
      return s;
    };
    const Cents due = scheduled + m.arrearsCents;
    if (due <= 0) {
      p.mortgage.reset();
      continue;
    }
    const std::optional<Split> all = pay(due);
    const std::optional<Split> month = !all && m.arrearsCents > 0 && scheduled > 0 ? pay(scheduled) : std::nullopt;
    // The schedule moves on either way; a payment that wasn't made is owed on top, as arrears.
    if (scheduled > 0) {
      m.balanceCents += interest - scheduled;
      m.monthsLeft = std::max(0, m.monthsLeft - 1);
    }
    const std::optional<Split>& paid = all ? all : month;
    if (paid) {
      const Cents amount = all ? due : scheduled;
      const std::vector<Cents> shares = evenShares(amount, owners.size());
      if (all) {
        m.arrearsCents = 0;
        m.missedPayments = 0;
      }
      for (std::size_t i = 0; i < owners.size(); ++i) {
        std::string text = "Mortgage payment for " + name + ": " + formatMoney(amount) + " paid";
        text += owners.size() > 1 ? " (your share " + formatMoney(shares[i]) + ")." : ".";
        if (paid->covered[i] > 0) text += " Your co-owner covered " + formatMoney(paid->covered[i]) + " of your share.";
        if (paid->pay[i] > shares[i])
          text += " You covered " + formatMoney(paid->pay[i] - shares[i]) + " of your co-owner's share.";
        if (m.missedPayments > 0)
          text +=
              " You're still " + plural(m.missedPayments, "payment") + " behind (" + formatMoney(m.arrearsCents) + ").";
        else if (m.balanceCents > 0)
          text += " " + formatMoney(m.balanceCents) + " left to pay, " + plural(m.monthsLeft, "month") + " to go.";
        notify(owners[i], "bank", text);
      }
    } else {
      m.arrearsCents += scheduled + H.lateFeeCents;
      m.missedPayments += 1;
      const int left = H.missedPaymentsToForeclose - m.missedPayments;
      for (const auto& id : owners) {
        std::string text = "You missed the mortgage payment for " + name + " (" +
                           formatMoney(scheduled > 0 ? scheduled : due) + "). You're " +
                           plural(m.missedPayments, "payment") + " behind: " + formatMoney(m.arrearsCents) + " owed";
        text += H.lateFeeCents > 0 ? ", with late fees." : ".";
        if (left == 1)
          text += " One more missed payment and " + orgName(*content_, m.lender) + " forecloses.";
        else if (left > 1)
          text += " After " + plural(H.missedPaymentsToForeclose, "missed payment") + " the bank forecloses.";
        notify(id, "bank", text);
      }
      if (left <= 0) {
        foreclosures.push_back(pid);
        continue;
      }
    }
    if (m.balanceCents <= 0 && m.arrearsCents <= 0) {
      p.mortgage.reset();
      for (const auto& id : owners) notify(id, "home", "The mortgage on " + name + " is paid off. It's all yours.");
    }
  }
  for (const auto& pid : foreclosures) {
    if (const PropertyDef* def = content_->property(pid)) foreclose(state_.properties.at(pid), *def);
  }
}

// ---- Simulation ----------------------------------------------------------------------------
// A day before the mortgage comes out, owners who can't cover it between them hear about it.
void World::stepHomesHourly() {
  if (state_.now % kMinutesPerMonth != kMinutesPerMonth - kMinutesPerDay) return;
  for (const auto& [pid, p] : state_.properties) {
    if (!p.mortgage || p.owners.empty()) continue;
    Cents interest = 0;
    const Cents due = scheduledPayment(*p.mortgage, interest) + p.mortgage->arrearsCents;
    std::vector<Cents> balances;
    for (const auto& id : p.owners) balances.push_back(state_.ledger.balance(bankAccountOf(id)));
    if (due <= 0 || splitBill(due, balances).complete) continue;
    for (const auto& id : p.owners) {
      notify(id, "bank",
             "The mortgage payment for " + homeName(*content_, pid) + " (" + formatMoney(due) +
                 ") comes out tomorrow, and there isn't enough in the bank to cover it.");
    }
  }
}

Json World::phoneHomes(const CharacterState& c) const {
  const HomesConfig& H = content_->homes();
  auto person = [&](const CharacterId& id) {
    const CharacterDef* d = definition(id);
    return Json{{"id", id}, {"name", d ? d->fullName() : id}};
  };
  const GameMinutes nextMonth = (state_.now / kMinutesPerMonth + 1) * kMinutesPerMonth;
  auto view = [&](const PropertyState& p) {
    const PropertyDef* def = content_->property(p.id);
    const LocationDef* loc = def ? content_->location(def->location) : nullptr;
    const std::vector<CharacterId> living = residentsOf(p);
    Json owners = Json::array();
    for (const auto& id : p.owners) owners.push_back(person(id));
    Json residents = Json::array();
    for (const auto& id : living) residents.push_back(person(id));
    const bool owner = has(p.owners, c.id);
    const bool lives = has(living, c.id);
    std::string tenure = owner              ? (p.owners.size() > 1 ? "co-owner" : "owner")
                         : p.owners.empty() ? (p.tenant == c.id ? "renting (your lease)" : "renting")
                                            : "living with the owner";
    Json j{{"property", p.id},
           {"name", loc ? loc->name : p.id},
           {"address", loc ? addressOf(*loc) : p.id},
           {"type", def ? def->type : ""},
           {"bedrooms", def ? def->bedrooms : 0},
           {"district", loc ? loc->district : ""},
           {"door", loc ? Json{loc->door.x, loc->door.y} : Json()},
           {"tenure", tenure},
           {"lives_here", lives},
           {"owners", owners},
           {"residents", residents}};
    if (def && def->rentMonthlyCents > 0 && lives) {
      const auto idx = static_cast<std::size_t>(std::find(living.begin(), living.end(), c.id) - living.begin());
      j["rent"] = Json{{"monthly_cents", def->rentMonthlyCents},
                       {"your_share_cents", evenShares(def->rentMonthlyCents, living.size())[idx]},
                       {"split_between", living.size()},
                       {"next_due", formatDateTime(nextMonth)},
                       {"your_arrears_cents", c.rentArrearsCents}};
    }
    if (owner) {
      j["market_value_cents"] = def ? def->marketValueCents : 0;
      if (p.mortgage) {
        const MortgageState& m = *p.mortgage;
        const auto idx = static_cast<std::size_t>(std::find(p.owners.begin(), p.owners.end(), c.id) - p.owners.begin());
        j["mortgage"] = Json{{"lender", orgName(*content_, m.lender)},
                             {"payment_cents", m.paymentCents},
                             {"your_share_cents", evenShares(m.paymentCents, p.owners.size())[idx]},
                             {"balance_cents", m.balanceCents},
                             {"arrears_cents", m.arrearsCents},
                             {"owed_cents", m.balanceCents + m.arrearsCents},
                             {"months_left", m.monthsLeft},
                             {"missed_payments", m.missedPayments},
                             {"forecloses_after", H.missedPaymentsToForeclose},
                             {"annual_rate", m.annualRate},
                             {"next_payment", formatDateTime(nextMonth)}};
      } else {
        j["mortgage"] = nullptr;
        j["owned_outright"] = true;
      }
    }
    return j;
  };
  const PropertyState* home = homeOf(c.id);
  Json out{{"home", home ? view(*home) : Json()}};
  Json owned = Json::array();
  Json listings = Json::array();
  for (const auto& [pid, p] : state_.properties) {
    if (&p != home && has(p.owners, c.id)) owned.push_back(view(p));
    const PropertyDef* def = content_->property(pid);
    if (!def || !def->forSale || !p.owners.empty()) continue;
    const LocationDef* loc = content_->location(def->location);
    const Cents price = def->marketValueCents;
    const Cents minDown = minimumDown(H, price);
    listings.push_back(Json{{"property", pid},
                            {"name", loc ? loc->name : pid},
                            {"address", loc ? addressOf(*loc) : pid},
                            {"type", def->type},
                            {"bedrooms", def->bedrooms},
                            {"amenities", def->amenities},
                            {"price_cents", price},
                            {"min_down_payment_cents", minDown},
                            {"est_monthly_cents", amortizedPayment(price - minDown, H.annualRate, H.termMonths)},
                            {"seller", orgName(*content_, p.ownerAccount)},
                            {"door", loc ? Json{loc->door.x, loc->door.y} : Json()}});
  }
  out["also_own"] = owned;
  out["listings"] = listings;
  // Partners you could buy a home with. Their money is theirs: the bank checks it when they say yes.
  Json partners = Json::array();
  for (const auto& [key, rel] : state_.relationships) {
    if (key.first != c.id || !isPartner(rel.status)) continue;
    Json j = person(key.second);
    j["status"] = rel.status;
    j["lives_with_you"] = home && has(residentsOf(*home), key.second);
    partners.push_back(j);
  }
  out["buy_with"] = partners;
  out["terms"] = Json{{"lender", orgName(*content_, H.lender)},
                      {"min_down_payment", H.minDownPayment},
                      {"annual_rate", H.annualRate},
                      {"term_months", H.termMonths},
                      {"missed_payments_to_foreclose", H.missedPaymentsToForeclose},
                      {"late_fee_cents", H.lateFeeCents},
                      {"max_payment_share_of_pay", H.maxPaymentShareOfPay},
                      {"reserve_months", H.reserveMonths},
                      {"your_monthly_pay_cents", monthlyPayOf(c)},
                      {"your_mortgage_payments_cents", mortgageShareOf(c.id)}};
  if (!home) out["note"] = kNoHomeNote;
  return out;
}

// ---- Save ----------------------------------------------------------------------------------
// Keyed by property id. The properties table keeps owner_account and tenant; this keeps who
// lives there, who owns it, and the mortgage.
Json homesPartToJson(const WorldState& s) {
  Json homes = Json::object();
  for (const auto& [pid, p] : s.properties) {
    if (p.residents.empty() && p.owners.empty() && !p.mortgage) continue;
    Json j{{"residents", p.residents}, {"owners", p.owners}};
    if (p.mortgage) {
      const MortgageState& m = *p.mortgage;
      j["mortgage"] = Json{{"lender", m.lender},
                           {"principal_cents", m.principalCents},
                           {"balance_cents", m.balanceCents},
                           {"payment_cents", m.paymentCents},
                           {"annual_rate", m.annualRate},
                           {"term_months", m.termMonths},
                           {"months_left", m.monthsLeft},
                           {"missed_payments", m.missedPayments},
                           {"arrears_cents", m.arrearsCents},
                           {"started_at", m.startedAt}};
    }
    homes[pid] = j;
  }
  return Json{{"properties", homes}};
}

void homesPartFromJson(WorldState& s, const Json& j) {
  if (!j.is_object() || !j.contains("properties")) return;  // an older save: World fills residents in from tenants
  for (const auto& [pid, h] : j.at("properties").items()) {
    auto it = s.properties.find(pid);
    if (it == s.properties.end()) continue;
    PropertyState& p = it->second;
    p.residents = h.value("residents", std::vector<CharacterId>{});
    p.owners = h.value("owners", std::vector<CharacterId>{});
    p.mortgage.reset();
    if (h.contains("mortgage") && h.at("mortgage").is_object()) {
      const Json& mj = h.at("mortgage");
      MortgageState m;
      m.lender = mj.value("lender", "");
      m.principalCents = mj.value("principal_cents", Cents{0});
      m.balanceCents = mj.value("balance_cents", Cents{0});
      m.paymentCents = mj.value("payment_cents", Cents{0});
      m.annualRate = mj.value("annual_rate", 0.0);
      m.termMonths = mj.value("term_months", 0);
      m.monthsLeft = mj.value("months_left", 0);
      m.missedPayments = mj.value("missed_payments", 0);
      m.arrearsCents = mj.value("arrears_cents", Cents{0});
      m.startedAt = mj.value("started_at", GameMinutes{0});
      p.mortgage = m;
    }
  }
}

// Homes keeps nothing per character: who lives where, and who owes what, is on the property.
void writeHomesCharacter(const CharacterState& c, Json& j) {
  (void)c;
  (void)j;
}

void readHomesCharacter(CharacterState& c, const Json& j) {
  (void)c;
  (void)j;
}

}  // namespace livera
