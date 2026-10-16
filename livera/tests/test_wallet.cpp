// Tests for M0.8 wallet: see docs/m08/wallet.md.
#include <atomic>
#include <chrono>
#include <cmath>
#include <thread>

#include "TestSupport.h"
#include "core/Clock.h"
#include "core/Parts.h"
#include "core/Serialization.h"
#include "net/Socket.h"
#include "persistence/SqliteStore.h"
#include "server/Server.h"

using namespace livera;
using namespace livera::test;

namespace {

// Real content without random illness; `phones` retunes the phones section, `extra` anything else.
std::shared_ptr<const ContentDatabase> walletContent(const std::function<void(Json&)>& phones = {},
                                                     const std::function<void(Json&, const std::string&)>& extra = {}) {
  return patchedContent([&](Json& doc, const std::string& file) {
    if (file == "conditions.json") {
      for (auto& c : doc["conditions"]) {
        if (c.contains("catch")) c["catch"] = Json{{"hourly_chance", 0.0}};
      }
    }
    if (file == "phones.json" && phones) phones(doc["phones"]);
    if (extra) extra(doc, file);
  });
}

std::shared_ptr<const ContentDatabase> quietWallet() {
  static auto db = walletContent();
  return db;
}

// The basic phone lasts `hours` online away from a charger (5 hours = 20% an hour).
std::shared_ptr<const ContentDatabase> shortBattery(double hours) {
  return walletContent([hours](Json& p) {
    for (auto& m : p["models"]) {
      if (m["item"] == "lyra_one") m["battery_hours"] = hours;
    }
  });
}

World walletWorld(std::shared_ptr<const ContentDatabase> db = quietWallet()) {
  World w = World::createNew(std::move(db));
  for (const char* id : {"dominique", "dax", "aaliyah"}) REQUIRE(w.connect(id));
  w.advanceMinutes(3 * 60);  // 10:00: shops open, buses running
  (void)w.drainEvents();
  return w;
}

double battery(const World& w, const CharacterId& id) { return w.character(id)->phone.battery; }
Cents bankOf(const World& w, const CharacterId& id) { return w.state().ledger.balance(bankAccountOf(id)); }
Cents cashOf(const World& w, const CharacterId& id) { return w.state().ledger.balance(cashAccountOf(id)); }
std::int64_t coinsOf(const World& w, const CharacterId& id) { return w.state().coins.balance(coinAccountOf(id)); }
int inventoryOf(const World& w, const CharacterId& id, const std::string& item) {
  const auto& inv = w.character(id)->inventory;
  auto it = inv.find(item);
  return it == inv.end() ? 0 : it->second;
}

bool notified(const World& w, const CharacterId& id, const std::string& fragment) {
  for (const auto& n : w.state().notifications) {
    if (n.recipient == id && n.text.find(fragment) != std::string::npos) return true;
  }
  return false;
}

// Out on the street until the phone dies.
void runFlat(World& w, const CharacterId& who) {
  if (!w.character(who)->inside.empty()) REQUIRE(w.exitBuilding(who));
  for (int i = 0; i < 100 && battery(w, who) > 0; ++i) w.advanceMinutes(60);
  REQUIRE(battery(w, who) == 0);
}

void walkToPoint(World& w, const CharacterId& who, Vec2 at) {
  if (!w.character(who)->inside.empty()) (void)w.exitBuilding(who);
  REQUIRE(w.moveTo(who, at));
  for (int i = 0; i < 3000 && w.character(who)->moveTarget; ++i) w.advanceRealTime(0.1);
}

Vec2 stopAt(const World& w, const std::string& id) {
  for (const auto& st : w.content().transit().lines.at(0).stops) {
    if (st.id == id) return st.at;
  }
  throw std::runtime_error("no stop " + id);
}

std::string contentError(const std::function<void(Json&, const std::string&)>& patch) {
  try {
    (void)patchedContent(patch);
  } catch (const std::exception& e) {
    return e.what();
  }
  return "";
}

bool contains(const std::string& s, const std::string& fragment) { return s.find(fragment) != std::string::npos; }

}  // namespace

// ---- Phones ---------------------------------------------------------------------------------

TEST_CASE("wallet: every adult carries a phone; older saves get one on load") {
  World w = World::createNew(quietWallet());
  const std::string basic = w.content().wallet().phones.basicModel;
  CHECK(basic == "lyra_one");
  for (const auto& [id, c] : w.state().characters) {
    CHECK(w.ageOf(id) >= w.content().life().adultAge);
    CHECK(c.phone.model == basic);
    CHECK(c.phone.battery == 100);
  }
  // A save from before phones: no "wallet" key and no coin ledger.
  WorldState old = w.state();
  Json j = toJson(old.characters.at("dominique"));
  j.erase("wallet");
  old.characters["dominique"] = characterStateFromJson(j);
  CHECK(old.characters.at("dominique").phone.model.empty());
  old.coins = Ledger{};
  walletPartFromJson(old, Json::object());
  World loaded(w.contentPtr(), old);
  CHECK(loaded.character("dominique")->phone.model == basic);
  CHECK(loaded.character("dominique")->phone.battery == 100);
  REQUIRE(loaded.state().coins.account(kCoinIssuerAccount));
  CHECK(loaded.state().coins.sumOfBalances() == 0);
}

TEST_CASE("wallet: a teenager has no phone until they turn 18") {
  World w = walletWorld();
  WorldState s = w.state();
  CharacterState& teen = s.characters.at("aaliyah");
  teen.bornAt = s.now - 18 * kMinutesPerYear + 90;  // 18 in an hour and a half
  teen.phone = PhoneState{};
  World young(w.contentPtr(), s);
  CHECK(young.ageOf("aaliyah") == 17);
  CHECK(young.character("aaliyah")->phone.model.empty());
  CHECK(young.openPhoneApp("aaliyah", "bank").error().code == "no_phone");
  CHECK(young.livpaySend("dominique", "aaliyah", 500, "").error().code == "no_livpay");
  young.advanceMinutes(120);
  CHECK(young.ageOf("aaliyah") == 18);
  CHECK(young.character("aaliyah")->phone.model == "lyra_one");
  CHECK(young.openPhoneApp("aaliyah", "bank"));
}

TEST_CASE("wallet: the battery drains while you're out, warns you, and dies") {
  World w = walletWorld(shortBattery(5));  // 20% an hour away from a charger
  w.advanceMinutes(60);                    // at home, on the charger
  CHECK(battery(w, "dominique") == 100);
  REQUIRE(w.exitBuilding("dominique"));
  w.advanceMinutes(60);
  CHECK_NEAR(battery(w, "dominique"), 80, 1e-6);
  w.advanceMinutes(3 * 60);
  CHECK_NEAR(battery(w, "dominique"), 20, 1e-6);
  CHECK(notified(w, "dominique", "Battery low (20%)"));
  CHECK(!notified(w, "dominique", "Your phone died"));
  w.advanceMinutes(60);
  CHECK(battery(w, "dominique") == 0);
  CHECK(notified(w, "dominique", "Your phone died"));
  CHECK(battery(w, "dax") == 100);  // Dax stayed home

  // A dead phone opens nothing and sends nothing.
  for (const char* app : {"bank", "messages", "wallet", "store", "map"}) {
    auto r = w.openPhoneApp("dominique", app);
    REQUIRE(!r);
    CHECK(r.error().code == "phone_dead");
    CHECK(r.error().message == "Your phone is dead. Charge it at home or at work.");
  }
  CHECK(w.sendMessage("dominique", "dax", "running late").error().code == "phone_dead");
  REQUIRE(w.sendMessage("dax", "dominique", "you there?"));  // it waits for her phone
  CHECK(w.livpaySend("dominique", "dax", 500, "").error().code == "phone_dead");
  CHECK(w.buyWithCoins("dominique", "case_marble").error().code == "phone_dead");

  // Home again: an hour on the charger brings it back.
  walkInto(w, "dominique", "lexington_1204");
  w.advanceMinutes(60);
  CHECK(battery(w, "dominique") > 30);
  auto wallet = w.openPhoneApp("dominique", "wallet");
  REQUIRE(wallet);
  CHECK(wallet.value().at("phone").at("charging") == "home");
  REQUIRE(w.sendMessage("dominique", "dax", "back now"));
  w.advanceMinutes(3 * 60);
  CHECK(battery(w, "dominique") == 100);
}

TEST_CASE("wallet: phones charge at work on shift, at public outlets, and while you're away") {
  World w = walletWorld(shortBattery(5));
  REQUIRE(w.exitBuilding("dominique"));
  w.advanceMinutes(2 * 60);
  walkInto(w, "dominique", "meridian_talent");
  double before = battery(w, "dominique");
  w.advanceMinutes(60);  // at the office but not on shift: not her charger yet
  CHECK(battery(w, "dominique") < before);
  REQUIRE(w.startShift("dominique"));
  before = battery(w, "dominique");
  w.advanceMinutes(60);
  CHECK(battery(w, "dominique") > before);
  CHECK(w.openPhoneApp("dominique", "wallet").value().at("phone").at("charging") == "work");
  REQUIRE(w.endShift("dominique"));

  // The café has outlets anyone can use.
  REQUIRE(w.exitBuilding("dominique"));
  w.advanceMinutes(2 * 60);
  walkInto(w, "dominique", "heritage_coffee");
  before = battery(w, "dominique");
  w.advanceMinutes(60);
  CHECK(battery(w, "dominique") > before);
  CHECK(w.openPhoneApp("dominique", "wallet").value().at("phone").at("charging") == "outlet");

  // Logged out on the street: her routine plugs it in.
  REQUIRE(w.exitBuilding("dominique"));
  runFlat(w, "dominique");
  w.disconnect("dominique");
  w.advanceMinutes(3 * 60);
  CHECK(battery(w, "dominique") == 100);
  REQUIRE(w.connect("dominique"));
  CHECK(w.openPhoneApp("dominique", "bank"));
}

TEST_CASE("wallet: better phones from Circuit Electronics; switching keeps the old one and its charge") {
  World w = walletWorld();
  REQUIRE(w.exitBuilding("dominique"));
  w.advanceMinutes(4 * 60);  // the basic phone loses 2.5% an hour out
  walkInto(w, "dominique", "circuit_electronics");
  const double oldCharge = battery(w, "dominique");
  CHECK(oldCharge < 100);
  CHECK(w.switchPhone("dominique", "lyra_air").error().code == "not_owned");
  const Cents bank = bankOf(w, "dominique");
  auto bought = w.buy("dominique", "lyra_air", "card");
  REQUIRE(bought);
  CHECK(bankOf(w, "dominique") == bank - 49900);
  CHECK(inventoryOf(w, "dominique", "lyra_air") == 1);

  // `use` a phone to switch to it: new in the box, full; the old one goes in your bag.
  auto used = w.useItem("dominique", "lyra_air");
  REQUIRE(used);
  CHECK(used.value().at("put_away") == "lyra_one");
  CHECK(w.character("dominique")->phone.model == "lyra_air");
  CHECK(battery(w, "dominique") == 100);
  CHECK(inventoryOf(w, "dominique", "lyra_air") == 0);
  CHECK(inventoryOf(w, "dominique", "lyra_one") == 1);

  // Refusals.
  CHECK(w.switchPhone("dominique", "nope").error().code == "unknown_item");
  CHECK(w.switchPhone("dominique", "laptop").error().code == "not_a_phone");
  CHECK(w.switchPhone("dominique", "lyra_pro").error().code == "not_owned");
  REQUIRE(w.buy("dominique", "lyra_air", "card"));  // a second Air, still in its box
  CHECK(w.switchPhone("dominique", "lyra_air").error().code == "already_using");

  // A case goes on the phone in your hand and moves with it.
  REQUIRE(w.buy("dominique", "case_clear", "card"));
  auto cased = w.useItem("dominique", "case_clear");
  REQUIRE(cased);
  CHECK(w.character("dominique")->phone.phoneCase == "case_clear");
  CHECK(inventoryOf(w, "dominique", "case_clear") == 0);
  REQUIRE(w.buy("dominique", "case_clear", "card"));
  CHECK(w.useItem("dominique", "case_clear").error().code == "already_using");

  // A better phone lasts longer: 60 hours instead of 40.
  REQUIRE(w.exitBuilding("dominique"));
  w.advanceMinutes(10 * 60);
  const double airCharge = 100 - 10 * 100.0 / 60;
  CHECK_NEAR(battery(w, "dominique"), airCharge, 1e-6);

  // switch_phone does the same; the phone you put away kept its charge, case and all.
  auto back = w.switchPhone("dominique", "lyra_one");
  REQUIRE(back);
  CHECK(w.character("dominique")->phone.model == "lyra_one");
  CHECK_NEAR(battery(w, "dominique"), oldCharge, 1e-9);
  CHECK(w.character("dominique")->phone.phoneCase == "case_clear");
  CHECK(inventoryOf(w, "dominique", "lyra_air") == 2);
  auto wallet = w.openPhoneApp("dominique", "wallet").value();
  CHECK(wallet.at("phone").at("label") == "Lyra One");
  REQUIRE(wallet.at("spare_phones").size() == 1);
  CHECK(wallet.at("spare_phones").at(0).at("item") == "lyra_air");
  CHECK(wallet.at("spare_phones").at(0).at("count") == 2);
  CHECK(wallet.at("spare_phones").at(0).at("battery") == Json::array({static_cast<int>(std::ceil(airCharge)), 100}));

  // With a used Air and a new one in the box, you take the new one; the used one keeps its charge.
  REQUIRE(w.switchPhone("dominique", "lyra_air"));
  CHECK(battery(w, "dominique") == 100);
  CHECK(inventoryOf(w, "dominique", "lyra_air") == 1);
  REQUIRE(w.character("dominique")->spareBatteries.at("lyra_air").size() == 1);
  CHECK_NEAR(w.character("dominique")->spareBatteries.at("lyra_air").at(0), airCharge, 1e-6);
  CHECK_NEAR(w.character("dominique")->spareBatteries.at("lyra_one").at(0), oldCharge, 1e-9);
}

// ---- Coins ----------------------------------------------------------------------------------

TEST_CASE("wallet: coins are credited once per store receipt") {
  World w = walletWorld();
  const Cents bank = bankOf(w, "dominique");
  auto r = w.creditCoins("dominique", "livera.coins.550", "test-receipt-1", true);
  REQUIRE(r);
  CHECK(r.value().at("coins_added") == 550);
  CHECK(r.value().at("test") == true);
  CHECK(coinsOf(w, "dominique") == 550);
  CHECK(bankOf(w, "dominique") == bank);  // coins never touch dollars
  CHECK(notified(w, "dominique", "550 coins added (a test purchase: no money was charged)."));
  const CoinReceipt& rec = w.state().coinReceipts.at("test-receipt-1");
  CHECK(rec.character == "dominique");
  CHECK(rec.product == "livera.coins.550");
  CHECK(rec.priceUsdCents == 499);
  CHECK(rec.test);
  CHECK(w.state().coins.transactions().back().kind == "coin_purchase_test");

  // The same receipt never pays twice, for anyone.
  CHECK(w.creditCoins("dominique", "livera.coins.550", "test-receipt-1", true).error().code == "duplicate_receipt");
  CHECK(w.creditCoins("dax", "livera.coins.100", "test-receipt-1", true).error().code == "duplicate_receipt");
  CHECK(coinsOf(w, "dominique") == 550);
  CHECK(coinsOf(w, "dax") == 0);

  // Unknown products and malformed receipts are refused, and don't use the receipt up.
  CHECK(w.creditCoins("dominique", "livera.coins.free", "test-receipt-2", true).error().code == "unknown_product");
  CHECK(w.creditCoins("dominique", "livera.coins.100", "", true).error().code == "invalid_receipt");
  CHECK(w.creditCoins("dominique", "livera.coins.100", "test receipt!", true).error().code == "invalid_receipt");
  CHECK(w.creditCoins("dominique", "livera.coins.100", std::string(200, 'a'), true).error().code == "invalid_receipt");
  CHECK(w.creditCoins("nobody", "livera.coins.100", "test-receipt-3", true).error().code == "unknown_character");
  REQUIRE(w.creditCoins("dax", "livera.coins.100", "test-receipt-2", false));
  CHECK(coinsOf(w, "dax") == 100);
  CHECK(w.state().coins.transactions().back().kind == "coin_purchase");

  // The coin ledger is zero-sum: the store has issued exactly what players hold.
  CHECK(w.state().coins.sumOfBalances() == 0);
  CHECK(w.state().coins.balance(kCoinIssuerAccount) == -650);
  CHECK(w.state().ledger.sumOfBalances() == 0);
}

TEST_CASE("wallet: the coin shop sells looks for coins, delivered to your inventory") {
  World w = walletWorld();
  CHECK(w.buyWithCoins("dominique", "riviera_sunglasses").error().code == "insufficient_coins");
  REQUIRE(w.creditCoins("dominique", "livera.coins.1200", "test-shop-1", true));
  auto store = w.openPhoneApp("dominique", "store");
  REQUIRE(store);
  CHECK(store.value().at("coins") == 1200);
  CHECK(store.value().at("items").size() == w.content().wallet().coinShop.size());
  CHECK(store.value().at("payments").at("available") == false);

  const Cents bank = bankOf(w, "dominique");
  auto r = w.buyWithCoins("dominique", "riviera_sunglasses");  // from home: it's an app
  REQUIRE(r);
  CHECK(r.value().at("coin_price") == 350);
  CHECK(coinsOf(w, "dominique") == 850);
  CHECK(bankOf(w, "dominique") == bank);
  CHECK(w.owns("dominique", "riviera_sunglasses"));
  REQUIRE(w.wear("dominique", "riviera_sunglasses"));
  CHECK(w.character("dominique")->accessory == "riviera_sunglasses");

  auto expensive = w.buyWithCoins("dominique", "meridian_chronograph");
  REQUIRE(!expensive);
  CHECK(expensive.error().code == "insufficient_coins");
  CHECK(contains(expensive.error().message, "costs 2200 coins; you have 850"));
  CHECK(coinsOf(w, "dominique") == 850);
  CHECK(!w.owns("dominique", "meridian_chronograph"));
  CHECK(w.buyWithCoins("dominique", "laptop").error().code == "not_in_store");
  CHECK(w.buyWithCoins("dominique", "nope").error().code == "unknown_item");

  // The gold edition is a phone like any other once it's yours.
  REQUIRE(w.creditCoins("dominique", "livera.coins.2500", "test-shop-2", true));
  REQUIRE(w.buyWithCoins("dominique", "lyra_pro_gold"));
  REQUIRE(w.useItem("dominique", "lyra_pro_gold"));
  CHECK(w.character("dominique")->phone.model == "lyra_pro_gold");
  CHECK(coinsOf(w, "dominique") == 850 + 2500 - 3000);
  CHECK(w.state().coins.sumOfBalances() == 0);
  CHECK(w.openPhoneApp("dominique", "store").value().at("items").size() > 0);
}

TEST_CASE("wallet: content can't sell an advantage for coins") {
  CHECK(contentError([](Json&, const std::string&) {}).empty());
  // A coin outfit more stylish than anything dollars buy.
  CHECK(contains(contentError([](Json& doc, const std::string& file) {
                   if (file != "phones.json") return;
                   for (auto& it : doc["items"]) {
                     if (it["id"] == "atelier_nuit_gown") it["style"] = 99;
                   }
                 }),
                 "coins can't buy an edge"));
  // Something useful (a laptop unlocks studying online).
  CHECK(contains(contentError([](Json& doc, const std::string& file) {
                   if (file == "coins.json") doc["coin_shop"].push_back(Json{{"item", "laptop"}, {"coin_price", 500}});
                 }),
                 "cosmetic"));
  // A coin-only phone that outlasts every phone sold for dollars.
  CHECK(contains(contentError([](Json& doc, const std::string& file) {
                   if (file != "phones.json") return;
                   for (auto& m : doc["phones"]["models"]) {
                     if (m["item"] == "lyra_pro_gold") m["battery_hours"] = 200;
                   }
                 }),
                 "outlast"));
  CHECK(contains(contentError([](Json& doc, const std::string& file) {
                   if (file == "coins.json") doc["coin_packs"][0]["coins"] = 0;
                 }),
                 "must be positive"));
  CHECK(contains(contentError([](Json& doc, const std::string& file) {
                   if (file == "phones.json") doc["phones"]["basic_model"] = "laptop";
                 }),
                 "basic_model"));
  CHECK(contains(contentError([](Json& doc, const std::string& file) {
                   if (file == "phones.json") doc["phones"]["models"].erase(1);  // lyra_air has no model
                 }),
                 "needs an entry in phones.models"));
}

// ---- LivPay ---------------------------------------------------------------------------------

TEST_CASE("wallet: LivPay taps to pay in shops and on the bus, from your bank") {
  World w = walletWorld();
  walkInto(w, "dominique", "thread_co");
  Cents bank = bankOf(w, "dominique");
  const Cents cash = cashOf(w, "dominique");
  auto r = w.buy("dominique", "sunglasses", "phone");
  REQUIRE(r);
  const Cents price = r.value().at("price_cents").get<Cents>();
  CHECK(price > 0);
  CHECK(bankOf(w, "dominique") == bank - price);
  CHECK(cashOf(w, "dominique") == cash);
  CHECK(w.state().ledger.transactions().back().kind == "livpay_purchase");
  CHECK(w.buy("dominique", "sunglasses", "bitcoin").error().code == "invalid_payment");

  // The bus: tap your phone (pay_with "phone"), or pay cash.
  const auto& line = w.content().transit().lines.at(0);
  walkToPoint(w, "dominique", stopAt(w, "stop_maple_court"));
  bank = bankOf(w, "dominique");
  CHECK(w.ride("dominique", "stop_riverside", true, "gold").error().code == "invalid_payment");
  auto ride = w.ride("dominique", "stop_riverside", true, "phone");
  REQUIRE(ride);
  CHECK(ride.value().at("paid_with") == "phone");
  CHECK(bankOf(w, "dominique") == bank - line.fareCents);
  CHECK(cashOf(w, "dominique") == cash);
  CHECK(w.state().ledger.transactions().back().kind == "livpay_fare");
  for (int i = 0; i < 400 && w.character("dominique")->moveTarget; ++i) w.advanceRealTime(0.1);
  auto byCash = w.ride("dominique", "stop_maple_court", true, "cash");
  REQUIRE(byCash);
  CHECK(cashOf(w, "dominique") == cash - line.fareCents);
  for (int i = 0; i < 400 && w.character("dominique")->moveTarget; ++i) w.advanceRealTime(0.1);

  // The wallet app lists what LivPay paid for.
  auto wallet = w.openPhoneApp("dominique", "wallet").value();
  const Json& recent = wallet.at("livpay").at("recent");
  REQUIRE(recent.size() == 2);
  CHECK(recent.at(0).at("what") == "fare");
  CHECK(recent.at(0).at("amount_cents") == -line.fareCents);
  CHECK(recent.at(1).at("what") == "paid");
  CHECK(recent.at(1).at("amount_cents") == -price);
}

TEST_CASE("wallet: a dead phone can't pay, but card and cash still work") {
  World w = walletWorld(shortBattery(2));
  walkTo(w, "dominique", "thread_co");
  runFlat(w, "dominique");
  REQUIRE(w.enter("dominique", "thread_co"));  // not an outlet
  CHECK(w.buy("dominique", "sunglasses", "phone").error().code == "phone_dead");
  CHECK(w.buy("dominique", "sunglasses", "card"));
  walkToPoint(w, "dominique", stopAt(w, "stop_maple_court"));
  REQUIRE(battery(w, "dominique") == 0);
  CHECK(w.ride("dominique", "stop_riverside", true, "phone").error().code == "phone_dead");
  CHECK(!w.character("dominique")->moveTarget);
  CHECK(w.ride("dominique", "stop_riverside", true, "card"));
}

TEST_CASE("wallet: LivPay sends money bank to bank, and says no when it should") {
  World w = walletWorld();
  const Cents domBank = bankOf(w, "dominique");
  const Cents daxBank = bankOf(w, "dax");
  auto r = w.livpaySend("dominique", "dax", 2500, "  coffee\nmoney  ");  // across town: she's home, so is he
  REQUIRE(r);
  CHECK(r.value().at("note") == "coffee money");
  CHECK(bankOf(w, "dominique") == domBank - 2500);
  CHECK(bankOf(w, "dax") == daxBank + 2500);
  const LedgerTransaction& tx = w.state().ledger.transactions().back();
  CHECK(tx.kind == "livpay");
  CHECK(tx.from == bankAccountOf("dominique"));
  CHECK(tx.to == bankAccountOf("dax"));
  CHECK(notified(w, "dax", "Dominique sent you $25.00 with LivPay: \"coffee money\""));
  auto daxWallet = w.openPhoneApp("dax", "wallet").value();
  CHECK(daxWallet.at("livpay").at("recent").at(0).at("what") == "received");
  CHECK(daxWallet.at("livpay").at("recent").at(0).at("amount_cents") == 2500);

  // The recipient needn't be online.
  w.disconnect("aaliyah");
  REQUIRE(w.livpaySend("dominique", "aaliyah", 100, ""));
  CHECK(notified(w, "aaliyah", "Dominique sent you $1.00 with LivPay."));

  // Refusals.
  const LivPayConfig& L = w.content().wallet().livpay;
  CHECK(w.livpaySend("dominique", "dominique", 100, "").error().code == "invalid_target");
  CHECK(w.livpaySend("dominique", "nobody", 100, "").error().code == "unknown_character");
  CHECK(w.livpaySend("dominique", "dax", 0, "").error().code == "invalid_amount");
  CHECK(w.livpaySend("dominique", "dax", -500, "").error().code == "invalid_amount");
  CHECK(w.livpaySend("dominique", "dax", L.perTransferLimitCents + 1, "").error().code == "over_limit");
  CHECK(w.livpaySend("dominique", "dax", 100, std::string(L.maxNoteLength + 1, 'x')).error().code == "invalid_note");
  CHECK(w.livpaySend("aaliyah", "dax", 100, "").error().code == "not_in_world");

  // The daily cap: $5,000 a day, counted from the ledger.
  REQUIRE(w.livpaySend("dominique", "dax", L.perTransferLimitCents, ""));
  const Cents sent = 2500 + 100 + L.perTransferLimitCents;
  REQUIRE(w.livpaySend("dominique", "dax", L.dailyLimitCents - sent, ""));
  auto capped = w.livpaySend("dominique", "dax", 1, "");
  REQUIRE(!capped);
  CHECK(capped.error().code == "daily_limit");
  w.advanceMinutes(kMinutesPerDay);
  REQUIRE(w.livpaySend("dominique", "dax", 1, "next day"));
  CHECK(w.state().ledger.sumOfBalances() == 0);
}

TEST_CASE("wallet: LivPay can't send more than you have, or too many times a day") {
  World w = walletWorld(walletContent({}, [](Json& doc, const std::string& file) {
    if (file != "coins.json") return;
    doc["livpay"]["per_transfer_limit_cents"] = 1000000000;
    doc["livpay"]["daily_limit_cents"] = 1000000000;
    doc["livpay"]["daily_transfers"] = 2;
  }));
  const Cents bank = bankOf(w, "dominique");
  CHECK(w.livpaySend("dominique", "dax", bank + 1, "").error().code == "insufficient_funds");
  CHECK(bankOf(w, "dominique") == bank);
  REQUIRE(w.livpaySend("dominique", "dax", 100, ""));
  REQUIRE(w.livpaySend("dominique", "dax", 100, ""));
  auto third = w.livpaySend("dominique", "dax", 100, "");
  REQUIRE(!third);
  CHECK(third.error().code == "daily_limit");
  CHECK(contains(third.error().message, "2 LivPay transfers today"));
}

TEST_CASE("wallet: a pickpocket gets cash, never what LivPay holds") {
  World w = walletWorld(walletContent({}, [](Json& doc, const std::string& file) {
    if (file != "crimes.json") return;
    for (auto& c : doc["crime"]["crimes"]) {
      if (c["id"] == "pickpocketing") c["detection"] = 0.0, c["per_witness"] = 0.0, c["per_staff"] = 0.0, c["per_police"] = 0.0;
    }
    doc["crime"]["pickpocket_notice_chance"] = 0.0;
  }));
  REQUIRE(w.connect("andre"));
  walkInto(w, "andre", "heritage_coffee");
  walkInto(w, "dominique", "heritage_coffee");
  const Cents bank = bankOf(w, "dominique");
  auto r = w.pickpocket("andre", "dominique");
  REQUIRE(r);
  CHECK(r.value().at("stolen_cents").get<Cents>() > 0);
  CHECK(bankOf(w, "dominique") == bank);
  CHECK(w.character("dominique")->phone.model == "lyra_one");
  CHECK(contains(w.openPhoneApp("dominique", "wallet").value().at("livpay").at("protection").get<std::string>(),
                 "pickpocket"));
}

// ---- The wallet app ---------------------------------------------------------------------------

TEST_CASE("wallet: the wallet app shows money, coins, the phone, and whether coins can be bought") {
  World w = walletWorld();
  REQUIRE(w.creditCoins("dominique", "livera.coins.100", "test-app-1", true));
  auto r = w.openPhoneApp("dominique", "wallet");
  REQUIRE(r);
  const Json& d = r.value();
  CHECK(d.at("bank_cents") == bankOf(w, "dominique"));
  CHECK(d.at("cash_cents") == cashOf(w, "dominique"));
  CHECK(d.at("coins") == 100);
  CHECK(d.at("phone").at("model") == "lyra_one");
  CHECK(d.at("phone").at("battery") == 100);
  CHECK(d.at("phone").at("hours_left") == 40);
  CHECK(d.at("phone").at("low") == false);
  CHECK(d.at("coin_packs").size() == w.content().wallet().coinPacks.size());
  CHECK(d.at("coin_packs").at(0).at("price") == "$0.99");
  CHECK(d.at("coin_purchases").size() == 1);
  CHECK(d.at("coin_purchases").at(0).at("test") == true);
  CHECK(d.at("livpay").at("per_transfer_limit_cents") == w.content().wallet().livpay.perTransferLimitCents);
  CHECK(d.at("payments").at("available") == false);
  CHECK(contains(d.at("payments").at("message").get<std::string>(), "App Store / Google Play"));
  // Only your own: Dax sees none of it.
  auto dax = w.openPhoneApp("dax", "wallet").value();
  CHECK(dax.at("coins") == 0);
  CHECK(dax.at("coin_purchases").empty());
  w.setTestPayments(true);
  CHECK(w.openPhoneApp("dominique", "wallet").value().at("payments").at("mode") == "test");
}

// ---- Saving -----------------------------------------------------------------------------------

TEST_CASE("wallet: coins, receipts and phones are saved") {
  auto path = tempPath("wallet.db");
  WorldState saved;
  {
    World w = walletWorld();
    REQUIRE(w.creditCoins("dominique", "livera.coins.1200", "test-save-1", true));
    REQUIRE(w.buyWithCoins("dominique", "case_marble"));
    REQUIRE(w.useItem("dominique", "case_marble"));
    walkInto(w, "dominique", "circuit_electronics");
    REQUIRE(w.buy("dominique", "lyra_pro", "card"));
    REQUIRE(w.exitBuilding("dominique"));
    w.advanceMinutes(5 * 60);
    REQUIRE(w.switchPhone("dominique", "lyra_pro"));  // the basic phone goes in the bag at 87.5%
    w.advanceMinutes(3 * 60);
    REQUIRE(w.livpaySend("dominique", "dax", 1234, "for the cab"));
    auto store = SqliteStore::open(path.string());
    REQUIRE(store);
    REQUIRE(store.value()->saveWorld(w.state()));
    saved = w.state();
  }
  auto store = SqliteStore::open(path.string());
  REQUIRE(store);
  auto loaded = store.value()->loadWorld();
  REQUIRE(loaded);
  World w(quietWallet(), std::move(loaded).value());
  const CharacterState& dom = *w.character("dominique");
  const CharacterState& was = saved.characters.at("dominique");
  CHECK(dom.phone.model == "lyra_pro");
  CHECK(dom.phone.phoneCase == "case_marble");
  CHECK_NEAR(dom.phone.battery, was.phone.battery, 1e-9);
  CHECK(dom.phone.battery < 100);
  CHECK(dom.spareBatteries == was.spareBatteries);
  CHECK_NEAR(dom.spareBatteries.at("lyra_one").at(0), 87.5, 1e-9);
  CHECK(coinsOf(w, "dominique") == 1200 - 150);
  CHECK(w.state().coins.sumOfBalances() == 0);
  CHECK(w.state().coins.transactions().size() == saved.coins.transactions().size());
  CHECK(w.state().coinReceipts.size() == 1);
  CHECK(w.state().coinReceipts.at("test-save-1").test);
  // After a restart the receipt still can't be used twice, and new transactions get fresh ids.
  CHECK(w.creditCoins("dominique", "livera.coins.1200", "test-save-1", true).error().code == "duplicate_receipt");
  REQUIRE(w.connect("dominique"));
  auto again = w.creditCoins("dominique", "livera.coins.100", "test-save-2", true);
  REQUIRE(again);
  for (const auto& t : saved.coins.transactions()) CHECK(t.id != again.value().at("tx").get<std::string>());
  auto wallet = w.openPhoneApp("dominique", "wallet").value();
  CHECK(wallet.at("livpay").at("recent").at(0).at("memo").get<std::string>().find("for the cab") != std::string::npos);
}

// ---- Over the network ---------------------------------------------------------------------------

namespace {

class WalletServer {
 public:
  WalletServer(const std::string& db, bool dev, bool testPayments) {
    ServerConfig cfg;
    cfg.port = 0;
    cfg.dbPath = db;
    cfg.content = quietWallet();
    cfg.devCommands = dev;
    cfg.testPayments = testPayments;
    cfg.passwordIterations = 1000;
    cfg.autosaveSeconds = 3600;
    auto s = Server::create(cfg);
    if (!s) throw std::runtime_error("server failed: " + s.error().message);
    server_ = std::move(s).value();
    port_ = server_->port();
    thread_ = std::thread([this] { server_->run(stop_); });
  }
  ~WalletServer() {
    if (thread_.joinable()) {
      stop_ = true;
      thread_.join();
    }
  }
  std::uint16_t port() const { return port_; }

 private:
  std::unique_ptr<Server> server_;
  std::uint16_t port_ = 0;
  std::atomic<bool> stop_{false};
  std::thread thread_;
};

class WalletClient {
 public:
  explicit WalletClient(std::uint16_t port) {
    auto fd = net::connectTcp("127.0.0.1", port);
    if (!fd) throw std::runtime_error("connect failed");
    fd_ = std::move(fd).value();
  }

  Json call(Json req) {
    req["id"] = ++id_;
    if (!net::sendAll(fd_, req.dump() + "\n")) throw std::runtime_error("send failed");
    const auto deadline = std::chrono::steady_clock::now() + std::chrono::seconds(10);
    while (std::chrono::steady_clock::now() < deadline) {
      auto line = net::readLine(fd_, buffer_, 100);
      if (!line) throw std::runtime_error("connection lost: " + line.error().message);
      if (!line.value()) continue;
      Json msg = Json::parse(*line.value());
      if (msg.contains("event")) continue;
      if (msg.value("re", Json()) == Json(id_)) return msg;
    }
    throw std::runtime_error("timed out waiting for reply");
  }

  Json ok(Json req) {
    Json r = call(req);
    if (!r.value("ok", false)) throw std::runtime_error("refused: " + req.dump() + " -> " + r.dump());
    return r["data"];
  }

  std::string refusal(Json req) {
    Json r = call(std::move(req));
    return r.value("ok", false) ? std::string("(accepted)") : r["error"]["code"].get<std::string>();
  }

  void play(const std::string& user, const std::string& character) {
    ok({{"op", "register"}, {"username", user}, {"password", "wallet-pass-1"}});
    ok({{"op", "login"}, {"username", user}, {"password", "wallet-pass-1"}});
    ok({{"op", "play"}, {"character", character}});
  }

 private:
  net::Fd fd_;
  net::LineBuffer buffer_;
  long id_ = 0;
};

}  // namespace

TEST_CASE("wallet: buy_coins is refused until a payment provider is connected") {
  WalletServer server(tempPath("wallet_live.db").string(), /*dev=*/false, /*testPayments=*/false);
  WalletClient dom(server.port());
  CHECK(dom.refusal({{"op", "buy_coins"}, {"product", "livera.coins.550"}, {"receipt", "test-1"}}) == "not_logged_in");
  dom.play("dom", "dominique");
  Json r = dom.call({{"op", "buy_coins"}, {"product", "livera.coins.550"}, {"receipt", "test-1"}});
  CHECK(r["ok"] == false);
  CHECK(r["error"]["code"] == "payments_unavailable");
  CHECK(contains(r["error"]["message"].get<std::string>(), "App Store / Google Play"));
  CHECK(dom.refusal({{"op", "buy_coins"}, {"product", "livera.coins.550"}, {"receipt", "real-receipt"}}) ==
        "payments_unavailable");
  Json wallet = dom.ok({{"op", "phone"}, {"app", "wallet"}});
  CHECK(wallet["coins"] == 0);
  CHECK(wallet["payments"]["available"] == false);
  CHECK(dom.refusal({{"op", "buy_with_coins"}, {"item", "case_marble"}}) == "insufficient_coins");
  CHECK(dom.refusal({{"op", "transfer_coins"}, {"to", "dax"}}) == "unknown_op");  // coins stay yours
}

TEST_CASE("wallet: with test payments, coins, the coin shop and LivPay work over the network") {
  WalletServer server(tempPath("wallet_test.db").string(), /*dev=*/false, /*testPayments=*/true);
  WalletClient dom(server.port());
  WalletClient dax(server.port());
  dom.play("dom", "dominique");
  dax.play("dax", "dax");
  CHECK(dom.ok({{"op", "phone"}, {"app", "wallet"}})["payments"]["mode"] == "test");
  Json bought = dom.ok({{"op", "buy_coins"}, {"product", "livera.coins.550"}, {"receipt", "test-net-1"}});
  CHECK(bought["coins"] == 550);
  CHECK(bought["test"] == true);
  CHECK(dom.refusal({{"op", "buy_coins"}, {"product", "livera.coins.550"}, {"receipt", "test-net-1"}}) ==
        "duplicate_receipt");
  CHECK(dax.refusal({{"op", "buy_coins"}, {"product", "livera.coins.550"}, {"receipt", "test-net-1"}}) ==
        "duplicate_receipt");
  CHECK(dom.refusal({{"op", "buy_coins"}, {"product", "livera.coins.550"}, {"receipt", "store-123"}}) ==
        "receipt_rejected");
  CHECK(dom.refusal({{"op", "buy_coins"}, {"product", "nope"}, {"receipt", "test-net-2"}}) == "unknown_product");

  Json shop = dom.ok({{"op", "buy_with_coins"}, {"item", "case_glitter"}});
  CHECK(shop["coins"] == 400);
  dom.ok({{"op", "use"}, {"item", "case_glitter"}});
  CHECK(dom.refusal({{"op", "switch_phone"}, {"item", "lyra_pro"}}) == "not_owned");

  Json sent = dom.ok({{"op", "livpay_send"}, {"to", "dax"}, {"cents", 1500}, {"note", "lunch"}});
  CHECK(sent["amount_cents"] == 1500);
  CHECK(dom.refusal({{"op", "livpay_send"}, {"to", "dax"}, {"cents", 0}}) == "invalid_amount");
  CHECK(dom.refusal({{"op", "livpay_send"}, {"to", "dax"}}) == "bad_request");
  CHECK(dom.refusal({{"op", "livpay_send"}, {"to", "dominique"}, {"cents", 100}}) == "invalid_target");
  Json daxWallet = dax.ok({{"op", "phone"}, {"app", "wallet"}});
  CHECK(daxWallet["livpay"]["recent"][0]["amount_cents"] == 1500);
  CHECK(daxWallet["coins"] == 0);
}

TEST_CASE("wallet: dev servers take test payments too") {
  WalletServer server(tempPath("wallet_dev.db").string(), /*dev=*/true, /*testPayments=*/false);
  WalletClient dom(server.port());
  dom.play("dom", "dominique");
  CHECK(dom.ok({{"op", "buy_coins"}, {"product", "livera.coins.100"}, {"receipt", "test-dev-1"}})["coins"] == 100);
}
