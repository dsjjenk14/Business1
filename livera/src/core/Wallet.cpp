// Coins bought with real money, phones (models, battery) and LivPay (tap to pay, send money).
// M0.8 feature file: see docs/m08/wallet.md.
//
// They share a file because they share the phone: the coin shop is a phone app, LivPay is the
// phone paying from your bank, and a phone with a flat battery opens nothing. Real money never
// enters the simulation: the server's payment verifier checks a store receipt and only then
// calls creditCoins, which credits a pack exactly once per receipt. Tuning is
// data/economy/coins.json and data/items/phones.json.
#include <algorithm>
#include <cctype>
#include <cmath>
#include <iterator>
#include <limits>
#include <set>

#include "core/Clock.h"
#include "core/Content.h"
#include "core/ContentParse.h"
#include "core/Parts.h"
#include "core/World.h"

namespace livera {

using namespace content_parse;

namespace {

constexpr double kBatteryFull = 100;
constexpr std::size_t kMaxReceiptLength = 128;
constexpr std::size_t kRecentActivity = 10;
constexpr std::size_t kRecentCoinPurchases = 5;

// Store receipt ids are opaque tokens; keep them to characters that are safe to log and store.
bool validReceiptId(const std::string& r) {
  if (r.empty() || r.size() > kMaxReceiptLength) return false;
  return std::all_of(r.begin(), r.end(), [](char ch) {
    return std::isalnum(static_cast<unsigned char>(ch)) || ch == '-' || ch == '_' || ch == '.' || ch == ':';
  });
}

// A LivPay note shows up in the recipient's notifications and both bank histories: no control characters.
std::string cleanNote(const std::string& text) {
  std::string s = text;
  for (char& ch : s) {
    if (static_cast<unsigned char>(ch) < 0x20 || ch == 0x7f) ch = ' ';
  }
  const auto b = s.find_first_not_of(' ');
  if (b == std::string::npos) return "";
  return s.substr(b, s.find_last_not_of(' ') - b + 1);
}

double totalEffect(const StatMap& m) {
  double sum = 0;
  for (const auto& [k, v] : m) sum += std::fabs(v);
  return sum;
}

// What a coin item is compared with: wearables by slot, everything else by category.
std::string peerGroup(const ItemDef& it) { return it.slot.empty() ? "category:" + it.category : "slot:" + it.slot; }

// Spare phones of one model are counted in the inventory; the batteries we remember are for the
// ones you put away. If you have fewer phones than records (you gave one away), forget the
// fullest ones first, so giving phones away never leaves you with more charge than you had.
void trimSpares(std::vector<double>& spares, int count) {
  std::sort(spares.begin(), spares.end());
  while (static_cast<int>(spares.size()) > std::max(0, count)) spares.pop_back();
}

int percent(double battery) { return static_cast<int>(std::ceil(battery - 1e-9)); }

// LivPay sends out of a bank account so far today, straight from the ledger (newest first, so the
// scan stops at midnight).
struct SentToday {
  Cents cents = 0;
  int transfers = 0;
};
SentToday livpaySentToday(const Ledger& ledger, const LedgerAccountId& bank, GameMinutes now) {
  const GameMinutes dayStart = toDateTime(now).dayIndex * kMinutesPerDay;
  SentToday out;
  const auto& txs = ledger.transactions();
  for (auto it = txs.rbegin(); it != txs.rend() && it->at >= dayStart; ++it) {
    if (it->kind == "livpay" && it->from == bank) {
      out.cents += it->amountCents;
      ++out.transfers;
    }
  }
  return out;
}

}  // namespace

LedgerAccountId coinAccountOf(const CharacterId& id) { return "coins:" + id; }

// ---- Content -------------------------------------------------------------------------------
Status ContentDatabase::ingestWallet(const std::string& source, const std::string& section, const Json& body,
                                     bool& handled) {
  handled = section == "coin_packs" || section == "coin_shop" || section == "phones" || section == "livpay";
  if (!handled) return okStatus();
  WalletConfig& W = wallet_;
  auto once = [&](bool& seen) -> Status {
    if (seen) return fail("content_duplicate", source + ": '" + section + "' defined twice");
    seen = true;
    return okStatus();
  };
  try {
    if (section == "coin_packs") {
      if (auto st = once(W.havePacks); !st) return st;
      for (const auto& j : body) {
        CoinPackDef p;
        p.productId = j.at("product_id").get<std::string>();
        p.label = j.at("label").get<std::string>();
        p.coins = j.at("coins").get<std::int64_t>();
        p.priceUsdCents = j.at("price_usd_cents").get<Cents>();
        W.coinPacks.push_back(std::move(p));
      }
    } else if (section == "coin_shop") {
      if (auto st = once(W.haveShop); !st) return st;
      for (const auto& j : body)
        W.coinShop.push_back(CoinShopEntry{j.at("item").get<std::string>(), j.at("coin_price").get<std::int64_t>()});
    } else if (section == "phones") {
      if (auto st = once(W.havePhones); !st) return st;
      PhonesConfig& P = W.phones;
      P.basicModel = body.at("basic_model").get<std::string>();
      P.lowBatteryPercent = body.value("low_battery_percent", P.lowBatteryPercent);
      P.chargeAtTypes = readStrings(body, "charge_at_types");
      for (const auto& j : body.at("models")) {
        PhoneModelDef m;
        m.item = j.at("item").get<std::string>();
        m.batteryHours = j.at("battery_hours").get<double>();
        m.chargeHours = j.at("charge_hours").get<double>();
        if (auto st = insertUnique(P.models, "phone model", m.item, m); !st) return st;
      }
    } else {
      if (auto st = once(W.haveLivpay); !st) return st;
      LivPayConfig& L = W.livpay;
      L.perTransferLimitCents = body.value("per_transfer_limit_cents", L.perTransferLimitCents);
      L.dailyLimitCents = body.value("daily_limit_cents", L.dailyLimitCents);
      L.dailyTransfers = body.value("daily_transfers", L.dailyTransfers);
      L.maxNoteLength = body.value("max_note_length", L.maxNoteLength);
    }
  } catch (const std::exception& e) {
    return fail("content_invalid", source + ": " + section + ": " + e.what());
  }
  return okStatus();
}

Status ContentDatabase::validateWallet() const {
  const WalletConfig& W = wallet_;
  std::set<std::string> ids;
  for (const auto& p : W.coinPacks) {
    const std::string where = "coin pack '" + p.productId + "'";
    if (p.productId.empty() || p.label.empty())
      return fail("content_invalid", where + ": needs a product_id and a label");
    if (!ids.insert(p.productId).second) return fail("content_duplicate", "duplicate " + where);
    if (p.coins <= 0 || p.priceUsdCents <= 0)
      return fail("content_invalid", where + ": coins and price_usd_cents must be positive");
  }

  const PhonesConfig& P = W.phones;
  if (W.havePhones) {
    if (!phoneModel(P.basicModel)) return fail("content_invalid", "phones.basic_model must be one of phones.models");
    for (const auto& [id, m] : P.models) {
      const ItemDef* it = item(id);
      if (!it || it->category != "phone")
        return fail("content_invalid", "phones.models: " + id + " must be an item of category phone");
      if (m.batteryHours <= 0 || m.chargeHours <= 0)
        return fail("content_invalid", "phone model " + id + ": hours must be positive");
    }
    if (P.lowBatteryPercent < 0 || P.lowBatteryPercent > kBatteryFull)
      return fail("content_invalid", "phones.low_battery_percent must be 0..100");
    for (const auto& type : P.chargeAtTypes) {
      const bool any =
          std::any_of(locations_.begin(), locations_.end(), [&](const auto& l) { return l.second.type == type; });
      if (!any) return fail("content_invalid", "phones.charge_at_types: no location has type '" + type + "'");
    }
  }
  for (const auto& [id, it] : items_) {
    if (it.category == "phone" && !phoneModel(id))
      return fail("content_invalid", "item " + id + ": a phone needs an entry in phones.models");
  }

  // The coin shop sells looks, not advantages: nothing usable, nothing that unlocks anything, and
  // nothing better than what dollars already buy in the same slot (style, feel-good, battery).
  struct Peer {
    double style = 0;
    double effect = 0;
  };
  std::map<std::string, Peer> peers;
  double bestBattery = 0;
  double fastestCharge = std::numeric_limits<double>::infinity();
  for (const auto& [lid, loc] : locations_) {
    for (const auto& o : loc.offers) {
      const ItemDef* it = item(o.item);
      if (!it) continue;
      Peer& peer = peers[peerGroup(*it)];
      peer.style = std::max(peer.style, it->style);
      peer.effect = std::max(peer.effect, totalEffect(it->emotionEffects));
      if (const PhoneModelDef* m = phoneModel(it->id)) {
        bestBattery = std::max(bestBattery, m->batteryHours);
        fastestCharge = std::min(fastestCharge, m->chargeHours);
      }
    }
  }
  std::set<std::string> shop;
  for (const auto& e : W.coinShop) {
    const std::string where = "coin_shop item '" + e.item + "'";
    const ItemDef* it = item(e.item);
    if (!it) return fail("content_invalid", where + ": unknown item");
    if (!shop.insert(e.item).second) return fail("content_duplicate", "duplicate " + where);
    if (e.coinPrice <= 0) return fail("content_invalid", where + ": coin_price must be positive");
    if (it->usable || it->consumable || !it->unlocks.empty() || !it->needEffects.empty() || !it->substance.empty() ||
        it->illegal || !it->test.empty() || it->contraception || !it->shortens.empty() ||
        !it->conditionRecovery.empty())
      return fail("content_invalid", where + ": coin-shop items are cosmetic (no use, needs, unlocks or medicine)");
    const auto peer = peers.find(peerGroup(*it));
    const Peer best = peer == peers.end() ? Peer{} : peer->second;
    if (it->style > best.style + 1e-9 || totalEffect(it->emotionEffects) > best.effect + 1e-9)
      return fail("content_invalid",
                  where + ": better than anything dollars buy in its slot (coins can't buy an edge)");
    if (const PhoneModelDef* m = phoneModel(it->id);
        m && (m->batteryHours > bestBattery || m->chargeHours < fastestCharge))
      return fail("content_invalid", where + ": a coin phone can't outlast the phones sold for dollars");
  }

  const LivPayConfig& L = W.livpay;
  if (L.perTransferLimitCents <= 0 || L.dailyLimitCents < L.perTransferLimitCents || L.dailyTransfers < 1 ||
      L.maxNoteLength < 1)
    return fail("content_invalid", "livpay: limits must be positive, and the daily limit at least one transfer");
  return okStatus();
}

const CoinPackDef* ContentDatabase::coinPack(const std::string& productId) const {
  for (const auto& p : wallet_.coinPacks) {
    if (p.productId == productId) return &p;
  }
  return nullptr;
}

const CoinShopEntry* ContentDatabase::coinShopEntry(const std::string& item) const {
  for (const auto& e : wallet_.coinShop) {
    if (e.item == item) return &e;
  }
  return nullptr;
}

const PhoneModelDef* ContentDatabase::phoneModel(const std::string& item) const {
  auto it = wallet_.phones.models.find(item);
  return it == wallet_.phones.models.end() ? nullptr : &it->second;
}

// ---- Phones --------------------------------------------------------------------------------
Status World::phoneUsable(const CharacterState& c) const {
  if (content_->wallet().phones.basicModel.empty()) return okStatus();  // a world without phones
  if (c.phone.model.empty()) return fail("no_phone", "You don't have a phone.");
  if (c.phone.battery <= 0) return fail("phone_dead", "Your phone is dead. Charge it at home or at work.");
  return okStatus();
}

void World::issuePhone(CharacterState& c) {
  const PhonesConfig& P = content_->wallet().phones;
  if (P.basicModel.empty() || !c.phone.model.empty() || ageOf(c.id) < content_->life().adultAge) return;
  c.phone.model = P.basicModel;
  c.phone.battery = kBatteryFull;
}

// A home you're welcome in (yours, your partner's, the family you nanny for), your workplace on
// shift, a study session, or a place with outlets anyone can use.
std::string World::chargingAt(const CharacterState& c) const {
  if (c.inside.empty()) return "";
  const LocationDef* loc = content_->location(c.inside);
  if (!loc) return "";
  if (loc->access == AccessRule::Residents && canAccess(c.id, *loc)) return "home";
  if (c.career.shiftStartedAt && c.inside == c.career.shiftLocation) return "work";
  if (c.education.sessionStartedAt && c.inside == c.education.sessionPlace) return "study";
  const auto& types = content_->wallet().phones.chargeAtTypes;
  if (std::find(types.begin(), types.end(), loc->type) != types.end()) return "outlet";
  return "";
}

// Once a game hour: the phone in your hand drains while you're out with it, and charges while
// you're somewhere with a charger or offline (whoever isn't being played plugs it in as part of
// their routine, as they look after their needs).
void World::stepWalletHourly() {
  const PhonesConfig& P = content_->wallet().phones;
  if (P.basicModel.empty()) return;
  for (auto& [id, c] : state_.characters) {
    issuePhone(c);  // someone who has just grown up
    for (auto it = c.spareBatteries.begin(); it != c.spareBatteries.end();) {
      auto inv = c.inventory.find(it->first);
      trimSpares(it->second, inv == c.inventory.end() ? 0 : inv->second);
      it = it->second.empty() ? c.spareBatteries.erase(it) : std::next(it);
    }
    const PhoneModelDef* model = content_->phoneModel(c.phone.model);
    if (!model) continue;
    const double charge = kBatteryFull / model->chargeHours;
    const double drain = kBatteryFull / model->batteryHours;
    const double before = c.phone.battery;
    double b = before;
    if (!c.online || !chargingAt(c).empty()) {
      b += charge;
    } else {
      // Logged in partway through the hour: it was on the charger until then.
      const double onlineHours = clampd(static_cast<double>(state_.now - c.lastOnlineAt) / 60.0, 0, 1);
      b += (1 - onlineHours) * charge - onlineHours * drain;
    }
    b = clampd(b, 0, kBatteryFull);
    if (b < 1e-6) b = 0;
    c.phone.battery = b;
    if (!c.online) continue;
    if (before > 0 && b <= 0) {
      notify(id, "phone", "Your phone died. Charge it at home, at work or somewhere with an outlet.");
    } else if (before > P.lowBatteryPercent && b <= P.lowBatteryPercent) {
      notify(id, "phone", "Battery low (" + std::to_string(percent(b)) + "%). Charge your phone soon.");
    }
  }
}

Result<Json> World::switchPhone(const CharacterId& actor, const std::string& item) {
  auto r = activeCharacter(actor);
  if (!r) return r.error();
  CharacterState& c = *r.value();
  const ItemDef* def = content_->item(item);
  if (!def) return fail("unknown_item", "no such item");
  if (def->category != "phone") return fail("not_a_phone", def->label + " isn't a phone");
  if (!owns(actor, item)) return fail("not_owned", "you don't have " + def->label);
  return usePhoneItem(c, *def);
}

Result<Json> World::usePhoneItem(CharacterState& c, const ItemDef& def) {
  if (def.category == "phone_case") {
    if (c.phone.model.empty()) return fail("no_phone", "You don't have a phone to put it on.");
    if (--c.inventory[def.id] <= 0) c.inventory.erase(def.id);
    if (!c.phone.phoneCase.empty()) c.inventory[c.phone.phoneCase] += 1;
    const std::string old = c.phone.phoneCase;
    c.phone.phoneCase = def.id;
    applyEmotions(c, def.emotionEffects);
    return Json{{"case", def.id}, {"label", def.label}, {"took_off", old}};
  }
  if (!content_->phoneModel(def.id)) return fail("not_a_phone", def.label + " isn't a phone this world knows");
  if (c.phone.model == def.id) return fail("already_using", "you're already using a " + def.label);
  // Out of the drawer: a phone you put away keeps its charge; one still in its box is full.
  double battery = kBatteryFull;
  {
    const int count = c.inventory[def.id];
    std::vector<double>& spares = c.spareBatteries[def.id];
    trimSpares(spares, count);
    if (static_cast<int>(spares.size()) >= count && !spares.empty()) {
      battery = spares.back();  // all of them are used: take the fullest
      spares.pop_back();
    }
    if (spares.empty()) c.spareBatteries.erase(def.id);
    if (count <= 1)
      c.inventory.erase(def.id);
    else
      c.inventory[def.id] = count - 1;
  }
  const std::string old = c.phone.model;
  if (!old.empty()) {
    c.inventory[old] += 1;
    c.spareBatteries[old].push_back(c.phone.battery);
  }
  c.phone.model = def.id;
  c.phone.battery = battery;
  applyEmotions(c, def.emotionEffects);
  Json out{{"phone", def.id}, {"label", def.label}, {"battery", percent(battery)}, {"put_away", old}};
  if (!c.phone.phoneCase.empty()) out["case"] = c.phone.phoneCase;  // the case moves to the new phone
  return out;
}

// ---- Coins ---------------------------------------------------------------------------------
Result<Json> World::creditCoins(const CharacterId& actor, const std::string& productId, const std::string& receiptId,
                                bool test) {
  if (!character(actor)) return fail("unknown_character", "no such character");
  if (!validReceiptId(receiptId))
    return fail("invalid_receipt", "a receipt id is 1-128 letters, digits, '-', '_', '.' or ':'");
  if (state_.coinReceipts.count(receiptId)) return fail("duplicate_receipt", "that receipt has already been credited");
  const CoinPackDef* pack = content_->coinPack(productId);
  if (!pack) return fail("unknown_product", "no such coin pack");
  const LedgerAccountId account = coinAccountOf(actor);
  if (!state_.coins.account(account)) (void)state_.coins.openAccount(LedgerAccount{account, actor, "coins", 0, false});
  auto tx =
      state_.coins.transfer(kCoinIssuerAccount, account, pack->coins, test ? "coin_purchase_test" : "coin_purchase",
                            pack->label + (test ? " (test purchase)" : "") + ", receipt " + receiptId, state_.now);
  if (!tx) return tx.error();
  state_.coinReceipts[receiptId] =
      CoinReceipt{receiptId, actor, pack->productId, pack->coins, pack->priceUsdCents, state_.now, test, tx.value()};
  notify(actor, "coins",
         std::to_string(pack->coins) + " coins added" + (test ? " (a test purchase: no money was charged)." : "."));
  return Json{{"product", pack->productId},
              {"label", pack->label},
              {"coins_added", pack->coins},
              {"coins", state_.coins.balance(account)},
              {"receipt", receiptId},
              {"test", test},
              {"tx", tx.value()}};
}

Result<Json> World::buyWithCoins(const CharacterId& actor, const std::string& item) {
  auto r = activeCharacter(actor);
  if (!r) return r.error();
  CharacterState& c = *r.value();
  if (Status st = phoneUsable(c); !st) return st.error();  // the coin shop is a phone app
  const ItemDef* def = content_->item(item);
  if (!def) return fail("unknown_item", "no such item");
  const CoinShopEntry* entry = content_->coinShopEntry(item);
  if (!entry) return fail("not_in_store", def->label + " isn't sold for coins");
  const LedgerAccountId account = coinAccountOf(actor);
  const std::int64_t have = state_.coins.balance(account);
  if (have < entry->coinPrice)
    return fail("insufficient_coins",
                def->label + " costs " + std::to_string(entry->coinPrice) + " coins; you have " + std::to_string(have));
  auto tx = state_.coins.transfer(account, kCoinIssuerAccount, entry->coinPrice, "coin_shop", def->label, state_.now);
  if (!tx) return tx.error();
  c.inventory[item] += 1;
  return Json{{"item", item},
              {"label", def->label},
              {"coin_price", entry->coinPrice},
              {"coins", state_.coins.balance(account)},
              {"owned", c.inventory[item]},
              {"tx", tx.value()}};
}

// ---- LivPay --------------------------------------------------------------------------------
Result<Json> World::livpaySend(const CharacterId& actor, const CharacterId& to, Cents cents, const std::string& note) {
  auto r = activeCharacter(actor);
  if (!r) return r.error();
  CharacterState& c = *r.value();
  if (Status st = phoneUsable(c); !st) return st.error();
  const LivPayConfig& L = content_->wallet().livpay;
  if (to == actor) return fail("invalid_target", "you can't send money to yourself");
  const CharacterState* t = character(to);
  const CharacterDef* them = definition(to);
  if (!t || !them) return fail("unknown_character", "no such person");
  // LivPay is bank to bank, so their phone needn't be on, but they need one to have LivPay at all.
  if (!content_->wallet().phones.basicModel.empty() && t->phone.model.empty())
    return fail("no_livpay", them->firstName + " doesn't have a phone with LivPay");
  if (cents <= 0) return fail("invalid_amount", "send at least $0.01");
  if (cents > L.perTransferLimitCents)
    return fail("over_limit", "LivPay sends up to " + formatMoney(L.perTransferLimitCents) + " at a time");
  const std::string text = cleanNote(note);
  if (static_cast<int>(text.size()) > L.maxNoteLength)
    return fail("invalid_note", "keep the note to " + std::to_string(L.maxNoteLength) + " characters");
  const LedgerAccountId bank = bankAccountOf(actor);
  const SentToday today = livpaySentToday(state_.ledger, bank, state_.now);
  if (today.transfers >= L.dailyTransfers)
    return fail("daily_limit",
                "that's " + std::to_string(L.dailyTransfers) + " LivPay transfers today; try again tomorrow");
  if (today.cents + cents > L.dailyLimitCents)
    return fail("daily_limit", "LivPay sends up to " + formatMoney(L.dailyLimitCents) + " a day; you can send " +
                                   formatMoney(L.dailyLimitCents - today.cents) + " more today");
  const CharacterDef* me = definition(actor);
  const std::string myName = me ? me->fullName() : actor;
  auto tx = state_.ledger.transfer(bank, bankAccountOf(to), cents, "livpay",
                                   "LivPay " + myName + " to " + them->fullName() + (text.empty() ? "" : ": " + text),
                                   state_.now);
  if (!tx) return tx.error();
  notify(to, "livpay",
         (me ? me->firstName : actor) + " sent you " + formatMoney(cents) + " with LivPay" +
             (text.empty() ? "." : ": \"" + text + "\""));
  return Json{{"tx", tx.value()},
              {"to", to},
              {"name", them->fullName()},
              {"amount_cents", cents},
              {"note", text},
              {"balance_cents", state_.ledger.balance(bank)},
              {"sent_today_cents", today.cents + cents}};
}

// ---- Phone apps ----------------------------------------------------------------------------
Json World::livpayActivity(const CharacterState& c, std::size_t limit) const {
  const LedgerAccountId bank = bankAccountOf(c.id);
  Json out = Json::array();
  const auto& txs = state_.ledger.transactions();
  for (auto it = txs.rbegin(); it != txs.rend() && out.size() < limit; ++it) {
    if (it->kind.rfind("livpay", 0) != 0 || (it->from != bank && it->to != bank)) continue;
    const bool outgoing = it->from == bank;
    const char* what = it->kind == "livpay"        ? (outgoing ? "sent" : "received")
                       : it->kind == "livpay_fare" ? "fare"
                                                   : "paid";
    Json row{{"at", it->at},
             {"when", formatDateTime(it->at)},
             {"what", what},
             {"amount_cents", outgoing ? -it->amountCents : it->amountCents},
             {"memo", it->memo}};
    if (it->kind == "livpay") {
      const LedgerAccount* other = state_.ledger.account(outgoing ? it->to : it->from);
      if (other) {
        const CharacterDef* who = definition(other->ownerId);
        row["with"] = who ? who->fullName() : other->ownerId;
      }
    }
    out.push_back(std::move(row));
  }
  return out;
}

Json World::coinPacksView() const {
  Json packs = Json::array();
  for (const auto& p : content_->wallet().coinPacks)
    packs.push_back(Json{{"product_id", p.productId},
                         {"label", p.label},
                         {"coins", p.coins},
                         {"price_usd_cents", p.priceUsdCents},
                         {"price", formatMoney(p.priceUsdCents)}});
  return packs;
}

Json World::paymentsView() const {
  if (testPayments_)
    return Json{{"available", true},
                {"mode", "test"},
                {"message", "Test payments: receipts starting with \"test-\" are accepted and no money is charged."}};
  return Json{{"available", false},
              {"mode", "unavailable"},
              {"message",
               "Buying coins needs real store billing (App Store / Google Play), which isn't connected to this "
               "server yet. Nothing can be bought with real money here."}};
}

Json World::phoneWallet(const CharacterState& c) const {
  const ContentDatabase& db = *content_;
  Json phone = Json::object();
  if (const ItemDef* def = db.item(c.phone.model)) {
    const PhoneModelDef* m = db.phoneModel(c.phone.model);
    const ItemDef* phoneCase = db.item(c.phone.phoneCase);
    phone = Json{{"model", c.phone.model},
                 {"label", def->label},
                 {"battery", percent(c.phone.battery)},
                 {"charging", chargingAt(c)},
                 {"hours_left", m ? std::round(c.phone.battery / kBatteryFull * m->batteryHours * 10) / 10 : 0},
                 {"case", phoneCase ? phoneCase->label : ""}};
  }
  Json spares = Json::array();
  for (const auto& [id, count] : c.inventory) {
    const ItemDef* def = db.item(id);
    if (!def || def->category != "phone" || count <= 0) continue;
    Json batteries = Json::array();
    auto it = c.spareBatteries.find(id);
    if (it != c.spareBatteries.end())
      for (double b : it->second) batteries.push_back(percent(b));
    while (static_cast<int>(batteries.size()) < count) batteries.push_back(percent(kBatteryFull));
    spares.push_back(Json{{"item", id}, {"label", def->label}, {"count", count}, {"battery", batteries}});
  }
  const LivPayConfig& L = db.wallet().livpay;
  const LedgerAccountId bank = bankAccountOf(c.id);
  const SentToday today = livpaySentToday(state_.ledger, bank, state_.now);
  std::vector<const CoinReceipt*> mine;
  for (const auto& [id, rec] : state_.coinReceipts) {
    if (rec.character == c.id) mine.push_back(&rec);
  }
  std::sort(mine.begin(), mine.end(), [](const CoinReceipt* a, const CoinReceipt* b) { return a->at > b->at; });
  Json purchases = Json::array();
  for (std::size_t i = 0; i < mine.size() && i < kRecentCoinPurchases; ++i)
    purchases.push_back(Json{{"when", formatDateTime(mine[i]->at)},
                             {"product", mine[i]->product},
                             {"coins", mine[i]->coins},
                             {"price_usd_cents", mine[i]->priceUsdCents},
                             {"test", mine[i]->test}});
  return Json{
      {"cash_cents", state_.ledger.balance(cashAccountOf(c.id))},
      {"bank_cents", state_.ledger.balance(bank)},
      {"coins", state_.coins.balance(coinAccountOf(c.id))},
      {"phone", phone},
      {"spare_phones", spares},
      {"livpay",
       Json{{"per_transfer_limit_cents", L.perTransferLimitCents},
            {"daily_limit_cents", L.dailyLimitCents},
            {"daily_transfers", L.dailyTransfers},
            {"sent_today_cents", today.cents},
            {"transfers_today", today.transfers},
            {"recent", livpayActivity(c, kRecentActivity)},
            {"protection", "LivPay pays from your bank account: a pickpocket can only take the cash in your pocket."}}},
      {"coin_packs", coinPacksView()},
      {"coin_purchases", purchases},
      {"payments", paymentsView()}};
}

Json World::phoneStore(const CharacterState& c) const {
  const ContentDatabase& db = *content_;
  const std::int64_t coins = state_.coins.balance(coinAccountOf(c.id));
  Json items = Json::array();
  for (const auto& e : db.wallet().coinShop) {
    const ItemDef* def = db.item(e.item);
    if (!def) continue;
    auto inv = c.inventory.find(e.item);
    const int owned =
        (inv == c.inventory.end() ? 0 : inv->second) + (c.phone.model == e.item || c.phone.phoneCase == e.item ? 1 : 0);
    items.push_back(Json{{"item", e.item},
                         {"label", def->label},
                         {"category", def->category},
                         {"slot", def->slot},
                         {"style", def->style},
                         {"coin_price", e.coinPrice},
                         {"owned", owned},
                         {"affordable", coins >= e.coinPrice}});
  }
  return Json{{"coins", coins},
              {"items", items},
              {"coin_packs", coinPacksView()},
              {"payments", paymentsView()},
              {"rules",
               "Coin items are looks, not advantages: nothing here beats what dollars buy. Coins can't be "
               "turned into dollars or sent to other players."}};
}

// ---- Save ----------------------------------------------------------------------------------
Json walletPartToJson(const WorldState& s) {
  Json accounts = Json::array();
  for (const auto& [id, a] : s.coins.accounts())
    accounts.push_back(Json{{"id", a.id},
                            {"owner", a.ownerId},
                            {"kind", a.kind},
                            {"balance", a.balanceCents},
                            {"allow_negative", a.allowNegative}});
  Json txs = Json::array();
  for (const auto& t : s.coins.transactions())
    txs.push_back(Json{{"id", t.id},
                       {"at", t.at},
                       {"from", t.from},
                       {"to", t.to},
                       {"amount", t.amountCents},
                       {"kind", t.kind},
                       {"memo", t.memo}});
  Json receipts = Json::array();
  for (const auto& [id, r] : s.coinReceipts)
    receipts.push_back(Json{{"receipt", r.receipt},
                            {"character", r.character},
                            {"product", r.product},
                            {"coins", r.coins},
                            {"price_usd_cents", r.priceUsdCents},
                            {"at", r.at},
                            {"test", r.test},
                            {"tx", r.tx}});
  return Json{{"coins", Json{{"accounts", accounts}, {"transactions", txs}, {"next_tx", s.coins.nextTxNumber()}}},
              {"receipts", receipts}};
}

void walletPartFromJson(WorldState& s, const Json& j) {
  if (j.contains("coins")) {
    const Json& c = j.at("coins");
    std::map<LedgerAccountId, LedgerAccount> accounts;
    const Json noRows = Json::array();
    const Json& accountRows = c.contains("accounts") ? c.at("accounts") : noRows;
    for (const auto& a : accountRows) {
      LedgerAccount acct{a.at("id").get<std::string>(), a.value("owner", ""), a.value("kind", ""),
                         a.value("balance", Cents{0}), a.value("allow_negative", false)};
      accounts.emplace(acct.id, acct);
    }
    std::vector<LedgerTransaction> txs;
    const Json& txRows = c.contains("transactions") ? c.at("transactions") : noRows;
    for (const auto& t : txRows)
      txs.push_back(LedgerTransaction{t.at("id").get<std::string>(), t.value("at", GameMinutes{0}), t.value("from", ""),
                                      t.value("to", ""), t.value("amount", Cents{0}), t.value("kind", ""),
                                      t.value("memo", "")});
    s.coins.restore(std::move(accounts), std::move(txs), c.value("next_tx", std::uint64_t{1}));
  }
  if (!j.contains("receipts")) return;
  for (const auto& r : j.at("receipts")) {
    CoinReceipt rec{r.at("receipt").get<std::string>(),
                    r.value("character", ""),
                    r.value("product", ""),
                    r.value("coins", std::int64_t{0}),
                    r.value("price_usd_cents", Cents{0}),
                    r.value("at", GameMinutes{0}),
                    r.value("test", false),
                    r.value("tx", "")};
    s.coinReceipts[rec.receipt] = rec;
  }
}

void writeWalletCharacter(const CharacterState& c, Json& j) {
  Json spares = Json::object();
  for (const auto& [model, batteries] : c.spareBatteries) {
    if (!batteries.empty()) spares[model] = batteries;
  }
  j["wallet"] =
      Json{{"phone", Json{{"model", c.phone.model}, {"battery", c.phone.battery}, {"case", c.phone.phoneCase}}},
           {"spare_batteries", spares}};
}

// A save from before phones has no "wallet" key: the world issues phones on load.
void readWalletCharacter(CharacterState& c, const Json& j) {
  if (!j.contains("wallet")) return;
  const Json& w = j.at("wallet");
  if (w.contains("phone")) {
    const Json& p = w.at("phone");
    c.phone.model = p.value("model", "");
    c.phone.battery = clampd(p.value("battery", kBatteryFull), 0, kBatteryFull);
    c.phone.phoneCase = p.value("case", "");
  }
  if (!w.contains("spare_batteries")) return;
  for (const auto& [model, batteries] : w.at("spare_batteries").items()) {
    std::vector<double> v;
    for (const auto& b : batteries) v.push_back(clampd(b.get<double>(), 0, kBatteryFull));
    if (!v.empty()) c.spareBatteries[model] = std::move(v);
  }
}

}  // namespace livera
