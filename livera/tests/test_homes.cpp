// Tests for M0.8 homes: see docs/m08/homes.md.
#include <atomic>
#include <chrono>
#include <fstream>
#include <map>
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

constexpr const char* kLender = "org:livera_savings_bank";
constexpr const char* kDeveloper = "org:willow_lane_homes";

// The real content, with quick walking so the tests don't spend game hours on the street.
std::shared_ptr<const ContentDatabase> homesContent() {
  static auto db = patchedContent([](Json& doc, const std::string& file) {
    if (file == "simulation.json") doc["simulation"]["walk_speed_mps"] = 60.0;
  });
  return db;
}

Cents bank(const World& w, const CharacterId& id) { return w.state().ledger.balance(bankAccountOf(id)); }
Cents balance(const World& w, const std::string& account) { return w.state().ledger.balance(account); }
// (a C string, not a std::string temporary, so GCC can see the reference outlives the call)
const PropertyState& prop(const World& w, const char* id) { return w.state().properties.at(id); }
const LocationDef& place(const World& w, const std::string& id) { return *w.content().location(id); }

bool notified(const World& w, const CharacterId& id, const std::string& fragment) {
  for (const auto& n : w.state().notifications) {
    if (n.recipient == id && n.text.find(fragment) != std::string::npos) return true;
  }
  return false;
}

bool remembers(const World& w, const CharacterId& id, const std::string& type) {
  for (const Memory* m : w.memoriesOf(id)) {
    if (m->type == type) return true;
  }
  return false;
}

// Moves money between characters' banks and the outside economy so they have exactly these
// balances. The ledger stays balanced; it's how the tests give someone savings or take them away.
World withBank(const World& w, const std::map<CharacterId, Cents>& banks) {
  WorldState s = w.state();
  for (const auto& [id, cents] : banks) {
    const Cents have = s.ledger.balance(bankAccountOf(id));
    if (cents > have)
      REQUIRE(s.ledger.transfer(kEconomyAccount, bankAccountOf(id), cents - have, "test", "savings", s.now));
    if (cents < have)
      REQUIRE(s.ledger.transfer(bankAccountOf(id), kEconomyAccount, have - cents, "test", "spent", s.now));
  }
  return World(w.contentPtr(), s);
}

// Runs the clock to just past the next first of the month, when rent and mortgages come out.
void toNextMonth(World& w) { w.advanceMinutes((w.now() / kMinutesPerMonth + 1) * kMinutesPerMonth - w.now() + 1); }

// On to 09:00, when the café is open.
void toMorning(World& w) { w.advanceMinutes((9 * 60 - w.now() % kMinutesPerDay + kMinutesPerDay) % kMinutesPerDay); }

// What a home's landlord was paid in rent at the last month tick.
Cents rentPaidFor(const World& w, const std::string& home) {
  const GameMinutes tick = w.now() / kMinutesPerMonth * kMinutesPerMonth;
  Cents total = 0;
  for (const auto& tx : w.state().ledger.transactions()) {
    if (tx.at == tick && tx.kind == "rent" && tx.memo == "Rent: " + home) total += tx.amountCents;
  }
  return total;
}

std::string ask(World& w, const CharacterId& from, const std::string& kind, const CharacterId& to,
                const std::string& subject = "") {
  auto r = w.request(from, kind, to, false, subject);
  if (!r) throw std::runtime_error(kind + " refused: " + r.error().message);
  return r.value().at("request").get<std::string>();
}

// They meet at the café and start dating.
void startDating(World& w, const CharacterId& a, const CharacterId& b) {
  walkInto(w, a, "heritage_coffee");
  walkInto(w, b, "heritage_coffee");
  REQUIRE(w.respond(b, ask(w, a, "date", b), true));
}

const Json* listing(const Json& app, const std::string& property) {
  for (const auto& l : app.at("listings")) {
    if (l.at("property") == property) return &l;
  }
  return nullptr;
}

const CharacterId kChild = "kai-ashford";

// Dominique and Dax have a child of `age`, who lives with Dominique at Lexington 1204.
World withChild(std::shared_ptr<const ContentDatabase> db, int age) {
  World w = World::createNew(db);
  WorldState s = w.state();
  Json sheet = toJson(*w.definition("dominique"));
  sheet["id"] = kChild;
  sheet["first_name"] = "Kai";
  sheet["age"] = age;
  sheet["sex"] = "male";
  sheet["pronouns"] = "he/him";
  sheet["playable"] = false;
  sheet["career"] = Json{{"id", ""}, {"level", 0}};
  sheet["finances"] = Json{{"cash_cents", 0}, {"bank_cents", 0}};
  sheet["degrees"] = Json::array();
  sheet["relationships"] = Json::array();
  sheet["fame"] = 0;
  auto def = ContentDatabase::parseCharacter(sheet);
  REQUIRE(def);
  s.createdCharacters[kChild] = def.value();
  CharacterState k;
  k.id = kChild;
  k.parents = {"dominique", "dax"};
  k.bornAt = s.now - age * kMinutesPerYear - 3 * kMinutesPerDay;
  k.lastBirthdayAge = age;
  k.heightCm = 120;
  k.weightKg = 23;
  k.inside = "lexington_1204";
  k.position = db->location("lexington_1204")->door;
  s.characters[kChild] = k;
  return World(db, s);
}

}  // namespace

TEST_CASE("homes: houses and condos are listed for sale with their terms") {
  World w = World::createNew(homesContent());
  REQUIRE(w.connect("dominique"));
  const Json app = w.openPhoneApp("dominique", "homes").value();
  CHECK(app.at("listings").size() == 8);
  const Json* house = listing(app, "willow_lane_2");
  REQUIRE(house);
  CHECK(house->at("name") == "2 Willow Lane");
  CHECK(house->at("address") == "2 Willow Lane");
  CHECK(house->at("type") == "house");
  CHECK(house->at("bedrooms") == 3);
  CHECK(house->at("price_cents") == 42000000);
  CHECK(house->at("min_down_payment_cents") == 4200000);
  CHECK(house->at("est_monthly_cents") == 226630);  // $378,000 at 6% over 360 months
  CHECK(house->at("seller") == "Willow Lane Homes");
  const Json* condo = listing(app, "lakeview_1a");
  REQUIRE(condo);
  CHECK(condo->at("type") == "condo");
  CHECK(condo->at("address") == "Lakeview Condos, Unit 1A, Willow Lane");
  CHECK(condo->at("bedrooms") == 2);
  // Her own home: the apartment she rents alone.
  CHECK(app.at("home").at("property") == "lexington_1204");
  CHECK(app.at("home").at("tenure") == "renting (your lease)");
  CHECK(app.at("home").at("rent").at("your_share_cents") == 245000);
  CHECK(app.at("buy_with").empty());
  CHECK(app.at("terms").at("lender") == "Livéra Savings Bank");
  CHECK(app.at("terms").at("your_monthly_pay_cents") == 4600 * 160);
  // Rentals stay rentals.
  CHECK(!w.content().property("lexington_1204")->forSale);
  CHECK(w.content().property("willow_lane_2")->forSale);
}

TEST_CASE("homes: buying a house alone, and each reason the bank says no") {
  World w = World::createNew(homesContent());
  REQUIRE(w.connect("dominique"));
  CHECK(w.buyHome("dominique", "atlantis").error().code == "unknown_property");
  CHECK(w.buyHome("dominique", "maple_court_2a").error().code == "not_for_sale");  // a rental
  CHECK(w.buyHome("dominique", "willow_lane_2").error().code == "too_far");
  walkTo(w, "dominique", "willow_lane_2");
  CHECK(w.enter("dominique", "willow_lane_2").error().code == "no_access");  // nobody lives there yet
  CHECK(w.buyHome("dominique", "willow_lane_2", 1000000).error().code ==
        "down_payment_too_small");                                                         // $10,000 of $420,000
  CHECK(w.buyHome("dominique", "willow_lane_2", 42000001).error().code == "bad_request");  // more than the price
  CHECK(w.buyHome("dominique", "willow_lane_2", -100).error().code == "bad_request");
  CHECK(w.buyHome("dominique", "willow_lane_2").error().code == "cant_afford");  // $14,500 toward $42,000 down

  // With $60,000 saved, the bank lends the rest: the payment is under 40% of her pay.
  w = withBank(w, {{"dominique", 6000000}});
  const Cents developer = balance(w, kDeveloper);
  const Cents lender = balance(w, kLender);
  auto bought = w.buyHome("dominique", "willow_lane_2");
  REQUIRE(bought);
  const Json b = bought.value();
  CHECK(b.at("price_cents") == 42000000);
  CHECK(b.at("down_payment_cents") == 4200000);
  CHECK(b.at("mortgage").at("principal_cents") == 37800000);
  CHECK(b.at("mortgage").at("payment_cents") == 226630);
  CHECK(bank(w, "dominique") == 6000000 - 4200000);
  CHECK(balance(w, kDeveloper) == developer + 42000000);  // the down payment and the loan
  CHECK(balance(w, kLender) == lender - 37800000);
  CHECK(w.state().ledger.sumOfBalances() == 0);
  {
    const PropertyState& home = prop(w, "willow_lane_2");
    CHECK((home.owners == std::vector<CharacterId>{"dominique"}));
    CHECK((home.residents == std::vector<CharacterId>{"dominique"}));
    CHECK(home.tenant == "dominique");
    REQUIRE(home.mortgage.has_value());
    CHECK(home.mortgage->balanceCents == 37800000);
    CHECK(home.mortgage->monthsLeft == 360);
    CHECK(home.mortgage->lender == kLender);
  }
  // Her lease on the apartment ended, and it's free for someone new.
  CHECK(b.at("moved").at("dominique").at("lease") == "ended");
  CHECK(prop(w, "lexington_1204").tenant.empty());
  CHECK(prop(w, "lexington_1204").residents.empty());
  CHECK(remembers(w, "dominique", "bought_home"));
  // It's her home now: she has a key, and housework counts there.
  REQUIRE(w.enter("dominique", "willow_lane_2"));
  REQUIRE(w.useActivity("dominique", "clean_home"));
  const Json app = w.openPhoneApp("dominique", "homes").value();
  CHECK(app.at("home").at("property") == "willow_lane_2");
  CHECK(app.at("home").at("tenure") == "owner");
  CHECK(app.at("home").at("mortgage").at("payment_cents") == 226630);
  CHECK(app.at("home").at("mortgage").at("balance_cents") == 37800000);
  CHECK(app.at("home").at("mortgage").at("months_left") == 360);
  CHECK(app.at("home").at("mortgage").at("missed_payments") == 0);
  CHECK(app.at("listings").size() == 7);
  const Json property = w.openPhoneApp("dominique", "property").value();
  REQUIRE(property.at("properties").size() == 1);
  CHECK(property.at("properties").at(0).at("tenure") == "owner");

  // Off the market.
  REQUIRE(w.connect("dax"));
  walkTo(w, "dax", "willow_lane_2");
  CHECK(w.buyHome("dax", "willow_lane_2").error().code == "sold");
  CHECK(w.enter("dax", "willow_lane_2").error().code == "no_access");
  CHECK(w.buyHome("dominique", "willow_lane_2").error().code == "already_own");

  // A second home on top of the first: together the payments are too much for her pay,
  // unless her savings would cover a year of them.
  walkTo(w, "dominique", "lakeview_1a");
  w = withBank(w, {{"dominique", 3800000}});  // $26,000 down leaves $12,000
  auto refused = w.buyHome("dominique", "lakeview_1a");
  CHECK(refused.error().code == "cant_carry");
  CHECK(refused.error().message.find("with the mortgage you already have") != std::string::npos);
  w = withBank(w, {{"dominique", 10000000}});  // $74,000 left over covers twelve months of both
  REQUIRE(w.buyHome("dominique", "lakeview_1a"));
  // She lives in the condo; she still owns the house, where nobody lives now.
  CHECK((prop(w, "lakeview_1a").residents == std::vector<CharacterId>{"dominique"}));
  CHECK((prop(w, "willow_lane_2").owners == std::vector<CharacterId>{"dominique"}));
  CHECK(prop(w, "willow_lane_2").residents.empty());
  CHECK(prop(w, "willow_lane_2").tenant == "dominique");  // the first owner, for older code
  const Json both = w.openPhoneApp("dominique", "homes").value();
  CHECK(both.at("home").at("property") == "lakeview_1a");
  REQUIRE(both.at("also_own").size() == 1);
  CHECK(both.at("also_own").at(0).at("property") == "willow_lane_2");
  CHECK(both.at("also_own").at(0).at("lives_here") == false);
  CHECK(both.at("terms").at("your_mortgage_payments_cents") == 226630 + 140295);
  CHECK(w.state().ledger.sumOfBalances() == 0);
}

TEST_CASE("homes: the mortgage comes out monthly; missed payments add up, and the bank forecloses") {
  World w = World::createNew(homesContent());
  REQUIRE(w.connect("dominique"));
  REQUIRE(w.connect("dax"));
  w = withBank(w, {{"dominique", 6000000}});
  walkTo(w, "dominique", "willow_lane_2");
  REQUIRE(w.buyHome("dominique", "willow_lane_2"));
  // Dax moves in with her; the house is hers alone.
  startDating(w, "dominique", "dax");
  walkInto(w, "dominique", "willow_lane_2");
  walkInto(w, "dax", "willow_lane_2");
  REQUIRE(w.respond("dax", ask(w, "dominique", "move_in", "dax"), true));
  CHECK(w.openPhoneApp("dax", "homes").value().at("home").at("tenure") == "living with the owner");
  CHECK(!w.openPhoneApp("dax", "homes").value().at("home").contains("mortgage"));  // her loan, not his business
  w.disconnect("dominique");  // the bank collects whether or not she's playing

  // Month 1: paid. Interest on $378,000 at 6% is $1,890; the rest comes off the balance.
  const Cents before = bank(w, "dominique");
  const Cents lender = balance(w, kLender);
  toNextMonth(w);
  CHECK(bank(w, "dominique") == before - 226630);
  CHECK(balance(w, kLender) == lender + 226630);
  CHECK(prop(w, "willow_lane_2").mortgage->balanceCents == 37800000 + 189000 - 226630);
  CHECK(prop(w, "willow_lane_2").mortgage->monthsLeft == 359);
  CHECK(notified(w, "dominique", "Mortgage payment for 2 Willow Lane: $2266.30 paid."));

  // She runs out of money: warned the day before, then the payment is missed.
  w = withBank(w, {{"dominique", 10000}});
  w.advanceMinutes(kMinutesPerMonth - kMinutesPerDay - (w.now() % kMinutesPerMonth));
  CHECK(notified(w, "dominique", "comes out tomorrow, and there isn't enough in the bank"));
  toNextMonth(w);
  CHECK(bank(w, "dominique") == 10000);  // nothing taken
  CHECK(prop(w, "willow_lane_2").mortgage->missedPayments == 1);
  CHECK(prop(w, "willow_lane_2").mortgage->arrearsCents == 226630 + 5000);  // with the late fee
  CHECK(prop(w, "willow_lane_2").mortgage->monthsLeft == 358);              // the schedule moves on
  CHECK(notified(w, "dominique", "You missed the mortgage payment for 2 Willow Lane"));

  // Enough for this month's payment, not the one she missed: still one behind.
  w = withBank(w, {{"dominique", 300000}});
  toNextMonth(w);
  CHECK(bank(w, "dominique") == 300000 - 226630);
  CHECK(prop(w, "willow_lane_2").mortgage->missedPayments == 1);
  CHECK(prop(w, "willow_lane_2").mortgage->arrearsCents == 231630);
  CHECK(notified(w, "dominique", "You're still 1 payment behind ($2316.30)"));

  // She catches up: this month's payment and what she owed.
  w = withBank(w, {{"dominique", 1000000}});
  toNextMonth(w);
  CHECK(bank(w, "dominique") == 1000000 - 226630 - 231630);
  CHECK(prop(w, "willow_lane_2").mortgage->missedPayments == 0);
  CHECK(prop(w, "willow_lane_2").mortgage->arrearsCents == 0);

  // Three missed payments in a row, and the bank takes the house.
  w = withBank(w, {{"dominique", 0}});
  toNextMonth(w);
  toNextMonth(w);
  CHECK(prop(w, "willow_lane_2").mortgage->missedPayments == 2);
  CHECK(notified(w, "dominique", "One more missed payment and Livéra Savings Bank forecloses."));
  CHECK(w.state().ledger.sumOfBalances() == 0);
  toNextMonth(w);
  {
    const PropertyState& lost = prop(w, "willow_lane_2");
    CHECK(lost.owners.empty());
    CHECK(lost.residents.empty());
    CHECK(lost.tenant.empty());
    CHECK(!lost.mortgage.has_value());
    CHECK(lost.ownerAccount == kLender);
  }
  CHECK(notified(w, "dominique", "Livéra Savings Bank foreclosed on 2 Willow Lane after 3 missed mortgage payments"));
  CHECK(remembers(w, "dominique", "foreclosure"));
  // Everyone who lived there lost it, and was told why; Dax was home, so he's out on the street.
  CHECK(notified(w, "dax", "Livéra Savings Bank foreclosed on 2 Willow Lane, and you've had to move out."));
  CHECK(w.character("dax")->inside.empty());
  CHECK(w.openPhoneApp("dax", "homes").value().at("home").is_null());

  // She can still play without a home, and she's told so. The bank has listed the house.
  REQUIRE(w.connect("dominique"));
  const Json app = w.openPhoneApp("dominique", "homes").value();
  CHECK(app.at("home").is_null());
  CHECK(app.at("note").get<std::string>().find("You can still play") != std::string::npos);
  const Json* relisted = listing(app, "willow_lane_2");
  REQUIRE(relisted);
  CHECK(relisted->at("seller") == "Livéra Savings Bank");
  CHECK(w.enter("dominique", "willow_lane_2").error().code == "no_access");
  CHECK(w.moveOut("dominique").error().code == "no_home");

  // Graham buys it from the bank outright: the price goes to the bank, and there's no loan.
  REQUIRE(w.connect("graham"));
  walkTo(w, "graham", "willow_lane_2");
  const Cents bankBefore = balance(w, kLender);
  auto cash = w.buyHome("graham", "willow_lane_2", 42000000);
  REQUIRE(cash);
  CHECK(cash.value().at("owned_outright") == true);
  CHECK(balance(w, kLender) == bankBefore + 42000000);
  CHECK(!prop(w, "willow_lane_2").mortgage.has_value());
  CHECK(w.state().ledger.sumOfBalances() == 0);
}

TEST_CASE("homes: the bank lends only what it has, and the last payment clears the mortgage") {
  World w = World::createNew(homesContent());
  REQUIRE(w.connect("dominique"));
  w = withBank(w, {{"dominique", 6000000}});
  walkTo(w, "dominique", "willow_lane_2");
  // A bank that has lent out nearly everything can't fund a $378,000 loan: nothing moves.
  {
    WorldState s = w.state();
    REQUIRE(s.ledger.transfer(kLender, kEconomyAccount, s.ledger.balance(kLender) - 10000000, "test", "lent elsewhere",
                              s.now));
    World broke(w.contentPtr(), s);
    CHECK(broke.buyHome("dominique", "willow_lane_2").error().code == "bank_unavailable");
    CHECK(bank(broke, "dominique") == 6000000);
    CHECK(broke.state().properties.at("willow_lane_2").owners.empty());
  }
  REQUIRE(w.buyHome("dominique", "willow_lane_2"));
  // Years later, one payment is left.
  {
    WorldState s = w.state();
    MortgageState& m = *s.properties.at("willow_lane_2").mortgage;
    m.balanceCents = 100000;
    m.monthsLeft = 1;
    w = World(w.contentPtr(), s);
  }
  const Cents before = bank(w, "dominique");
  const Cents lender = balance(w, kLender);
  toNextMonth(w);
  // $1,000 and a month's interest at 6% ($5): the last payment clears the balance.
  CHECK(bank(w, "dominique") == before - 100500);
  CHECK(balance(w, kLender) == lender + 100500);
  CHECK(!prop(w, "willow_lane_2").mortgage.has_value());
  CHECK((prop(w, "willow_lane_2").owners == std::vector<CharacterId>{"dominique"}));
  CHECK(notified(w, "dominique", "The mortgage on 2 Willow Lane is paid off. It's all yours."));
  const Json app = w.openPhoneApp("dominique", "homes").value();
  CHECK(app.at("home").at("owned_outright") == true);
  CHECK(app.at("home").at("mortgage").is_null());
  CHECK(app.at("terms").at("your_mortgage_payments_cents") == 0);
  // Nothing more comes out.
  const Cents after = bank(w, "dominique");
  toNextMonth(w);
  CHECK(bank(w, "dominique") == after);
  CHECK(w.state().ledger.sumOfBalances() == 0);
}

TEST_CASE("homes: partners buy a house together and split the mortgage") {
  World w = World::createNew(homesContent());
  for (const char* id : {"dominique", "dax", "harper"}) REQUIRE(w.connect(id));
  walkTo(w, "dominique", "willow_lane_4");
  walkTo(w, "dax", "willow_lane_4");
  CHECK(w.request("dax", "buy_home", "dominique", false, "willow_lane_4").error().code == "not_partners");
  startDating(w, "dax", "dominique");
  CHECK(w.request("dax", "buy_home", "dominique", false, "willow_lane_4").error().code == "too_far");  // at the café
  walkTo(w, "dominique", "willow_lane_4");
  walkTo(w, "dax", "willow_lane_4");
  CHECK(w.request("dax", "buy_home", "dominique", false, "").error().code == "unknown_property");
  CHECK(w.request("dax", "buy_home", "dominique", false, "maple_court_2a").error().code == "not_for_sale");
  // $445,000: $44,500 down, $22,250 each. Dax has $6,200.
  CHECK(w.request("dax", "buy_home", "dominique", false, "willow_lane_4").error().code == "cant_afford");

  // He can cover his half; she can't cover hers yet, so the bank says no when she says yes.
  w = withBank(w, {{"dax", 3000000}});
  auto refused = w.respond("dominique", ask(w, "dax", "buy_home", "dominique", "willow_lane_4"), true);
  CHECK(refused.error().code == "cant_afford");
  CHECK(notified(w, "dax", "couldn't cover their half"));
  CHECK(!notified(w, "dax", "and you have"));  // her bank balance is hers: he isn't told it
  CHECK(prop(w, "willow_lane_4").owners.empty());

  w = withBank(w, {{"dominique", 3000000}});
  const Cents developer = balance(w, kDeveloper);
  const Cents lender = balance(w, kLender);
  auto yes = w.respond("dominique", ask(w, "dax", "buy_home", "dominique", "willow_lane_4"), true);
  REQUIRE(yes);
  const Json home = yes.value().at("home");
  CHECK(home.at("bought") == "willow_lane_4");
  CHECK(home.at("down_payment_cents") == 4450000);
  CHECK(home.at("mortgage").at("payment_cents") == 240120);
  CHECK(home.at("mortgage").at("payment_share_cents") == 120060);
  CHECK(bank(w, "dax") == 3000000 - 2225000);
  CHECK(bank(w, "dominique") == 3000000 - 2225000);
  CHECK(balance(w, kDeveloper) == developer + 44500000);
  CHECK(balance(w, kLender) == lender - 40050000);
  CHECK((prop(w, "willow_lane_4").owners == std::vector<CharacterId>{"dax", "dominique"}));
  CHECK((prop(w, "willow_lane_4").residents == std::vector<CharacterId>{"dax", "dominique"}));
  CHECK(notified(w, "dax", "You and Dominique bought 4 Willow Lane"));
  CHECK(remembers(w, "dax", "bought_home"));
  CHECK(remembers(w, "dominique", "bought_home"));
  // Both leases ended.
  for (const char* old : {"lexington_1204", "maple_court_3b"}) {
    CHECK(prop(w, old).tenant.empty());
    CHECK(prop(w, old).residents.empty());
  }
  // Both have keys; Harper, a friend, doesn't.
  REQUIRE(w.enter("dax", "willow_lane_4"));
  REQUIRE(w.enter("dominique", "willow_lane_4"));
  walkTo(w, "harper", "willow_lane_4");
  CHECK(w.enter("harper", "willow_lane_4").error().code == "no_access");
  const Json app = w.openPhoneApp("dominique", "homes").value();
  CHECK(app.at("home").at("tenure") == "co-owner");
  CHECK(app.at("home").at("owners").size() == 2);
  CHECK(app.at("home").at("mortgage").at("your_share_cents") == 120060);
  REQUIRE(app.at("buy_with").size() == 1);
  CHECK(app.at("buy_with").at(0).at("id") == "dax");
  CHECK(app.at("buy_with").at(0).at("lives_with_you") == true);

  // Each month the payment is split evenly.
  Cents dax = bank(w, "dax");
  Cents dom = bank(w, "dominique");
  toNextMonth(w);
  CHECK(bank(w, "dax") == dax - 120060);
  CHECK(bank(w, "dominique") == dom - 120060);
  CHECK(notified(w, "dominique", "$2401.20 paid (your share $1200.60)."));

  // She can't pay her half: she pays what she can, and he covers the rest.
  w = withBank(w, {{"dominique", 5000}});
  dax = bank(w, "dax");
  toNextMonth(w);
  CHECK(bank(w, "dominique") == 0);
  CHECK(bank(w, "dax") == dax - (240120 - 5000));
  CHECK(prop(w, "willow_lane_4").mortgage->missedPayments == 0);
  CHECK(notified(w, "dominique", "Your co-owner covered $1150.60 of your share."));
  CHECK(notified(w, "dax", "You covered $1150.60 of your co-owner's share."));

  // Neither can: it's missed, and nothing moves.
  w = withBank(w, {{"dax", 1000}, {"dominique", 0}});
  toNextMonth(w);
  CHECK(bank(w, "dax") == 1000);
  CHECK(prop(w, "willow_lane_4").mortgage->missedPayments == 1);
  CHECK(notified(w, "dax", "You missed the mortgage payment for 4 Willow Lane"));

  // A co-owner who moves out still owns half, still pays half, and can move back in.
  w = withBank(w, {{"dax", 5000000}, {"dominique", 5000000}});
  auto out = w.moveOut("dominique");
  REQUIRE(out);
  CHECK(out.value().at("still_own") == true);
  CHECK(out.value().at("note").get<std::string>().find("move_home willow_lane_4") != std::string::npos);
  CHECK((prop(w, "willow_lane_4").owners == std::vector<CharacterId>{"dax", "dominique"}));
  CHECK((prop(w, "willow_lane_4").residents == std::vector<CharacterId>{"dax"}));
  CHECK(prop(w, "willow_lane_4").tenant == "dax");
  CHECK(notified(w, "dax", "Dominique moved out of 4 Willow Lane."));
  CHECK(w.character("dominique")->inside == "willow_lane_4");  // an owner keeps her key
  toNextMonth(w);                                              // this month's payment and last month's, split
  const Cents half = (240120 + 240120 + 5000) / 2;
  CHECK(bank(w, "dominique") == 5000000 - half);
  CHECK(bank(w, "dax") == 5000000 - half);
  CHECK(prop(w, "willow_lane_4").mortgage->missedPayments == 0);
  CHECK(w.moveHome("dominique", "willow_lane_2").error().code == "not_owner");
  REQUIRE(w.moveHome("dominique", "willow_lane_4"));
  CHECK(w.moveHome("dominique", "willow_lane_4").error().code == "already_home");
  CHECK((prop(w, "willow_lane_4").residents == std::vector<CharacterId>{"dax", "dominique"}));
  // The home's tenant (what older code, like housework, follows) is an owner who lives there.
  REQUIRE(w.moveOut("dax"));
  CHECK(prop(w, "willow_lane_4").tenant == "dominique");
  REQUIRE(w.moveHome("dax", "willow_lane_4"));
  CHECK(w.state().ledger.sumOfBalances() == 0);
}

TEST_CASE("homes: moving in together ends the lease, splits the rent and gives both a key") {
  World w = World::createNew(homesContent());
  for (const char* id : {"dominique", "dax", "harper"}) REQUIRE(w.connect(id));
  walkTo(w, "dax", "lexington_1204");
  CHECK(w.enter("dax", "lexington_1204").error().code == "no_access");  // not her partner yet
  startDating(w, "dominique", "dax");
  CHECK(w.request("dominique", "move_in", "dax").error().code == "wrong_place");  // at the café
  walkInto(w, "dominique", "lexington_1204");
  walkInto(w, "dax", "lexington_1204");  // her partner can come over
  const Cents daxRentBefore = bank(w, "dax");
  auto moved = w.respond("dax", ask(w, "dominique", "move_in", "dax"), true);
  REQUIRE(moved);
  const Json mv = moved.value().at("home");
  CHECK(mv.at("moved_in") == "lexington_1204");
  CHECK(mv.at("left").at("left") == "maple_court_3b");
  CHECK(mv.at("left").at("lease") == "ended");
  CHECK(mv.at("rent_share_cents") == 122500);
  CHECK((prop(w, "lexington_1204").residents == std::vector<CharacterId>{"dominique", "dax"}));
  CHECK(prop(w, "lexington_1204").tenant == "dominique");
  // His apartment is vacant again, ready for a newcomer.
  CHECK(prop(w, "maple_court_3b").tenant.empty());
  CHECK(prop(w, "maple_court_3b").residents.empty());
  CHECK(notified(w, "dominique", "Dax moved in with you at The Lexington, Apt 1204."));
  CHECK(remembers(w, "dax", "moved_in_together"));
  CHECK(w.request("dominique", "move_in", "dax").error().code == "already_living_together");
  CHECK(bank(w, "dax") == daxRentBefore);

  // The rent is split between them on the first of the month; his old place costs him nothing.
  Cents dom = bank(w, "dominique");
  Cents dax = bank(w, "dax");
  toNextMonth(w);
  CHECK(bank(w, "dominique") == dom - 122500);
  CHECK(bank(w, "dax") == dax - 122500);
  CHECK(rentPaidFor(w, "The Lexington, Apt 1204") == 245000);
  CHECK(rentPaidFor(w, w.content().location("maple_court_3b")->name) == 0);  // his lease ended
  CHECK(notified(w, "dax", "Rent of $2450.00 paid. Your share: $1225.00."));
  const Json app = w.openPhoneApp("dax", "homes").value();
  CHECK(app.at("home").at("tenure") == "renting");
  CHECK(app.at("home").at("rent").at("your_share_cents") == 122500);
  CHECK(app.at("home").at("rent").at("split_between") == 2);

  // He's broke this month: she covers his share.
  w = withBank(w, {{"dax", 0}});
  dom = bank(w, "dominique");
  toNextMonth(w);
  CHECK(bank(w, "dominique") == dom - 245000);
  CHECK(notified(w, "dax", "Dominique covered $1225.00 of it."));
  CHECK(w.character("dax")->rentArrearsCents == 0);
  // Neither can make the whole rent: she pays her share, and he owes his.
  w = withBank(w, {{"dax", 0}, {"dominique", 130000}});
  toNextMonth(w);
  CHECK(bank(w, "dominique") == 130000 - 122500);
  CHECK(w.character("dax")->rentArrearsCents == 122500);
  CHECK(w.character("dominique")->rentArrearsCents == 0);
  CHECK(notified(w, "dax", "Your share of the rent, $1225.00, is overdue."));

  // It's his home too: he gets in on his own key even after they break up. Harper can't.
  REQUIRE(w.endRelationship("dominique", "dax"));
  REQUIRE(w.exitBuilding("dax"));
  REQUIRE(w.enter("dax", "lexington_1204"));
  walkTo(w, "harper", "lexington_1204");
  CHECK(w.enter("harper", "lexington_1204").error().code == "no_access");

  // A one-bedroom has room for two.
  toMorning(w);
  startDating(w, "dominique", "harper");
  walkInto(w, "dominique", "lexington_1204");
  walkInto(w, "harper", "lexington_1204");
  CHECK(w.request("dominique", "move_in", "harper").error().code == "no_room");

  // The lease holder moves out: the lease passes to Dax, and she has to leave (it's not her home).
  REQUIRE(w.exitBuilding("harper"));
  auto out = w.moveOut("dominique");
  REQUIRE(out);
  CHECK(out.value().at("lease") == "passed to dax");
  CHECK(out.value().at("still_own") == false);
  CHECK(prop(w, "lexington_1204").tenant == "dax");
  CHECK((prop(w, "lexington_1204").residents == std::vector<CharacterId>{"dax"}));
  CHECK(notified(w, "dax", "Dominique moved out of The Lexington, Apt 1204. The lease is yours now."));
  CHECK(w.character("dominique")->inside.empty());
  CHECK(w.enter("dominique", "lexington_1204").error().code == "no_access");
  CHECK(w.moveOut("dominique").error().code == "no_home");
  CHECK(w.openPhoneApp("dominique", "homes").value().at("home").is_null());
  // Without a home she can't invite anyone home.
  CHECK(w.request("dominique", "move_in", "harper").error().code == "no_home");
  CHECK(w.state().ledger.sumOfBalances() == 0);
}

TEST_CASE("homes: a homeowner who moves in with a partner keeps the house") {
  World w = World::createNew(homesContent());
  for (const char* id : {"graham", "harper"}) REQUIRE(w.connect(id));
  walkTo(w, "graham", "willow_lane_8");
  REQUIRE(w.buyHome("graham", "willow_lane_8", 52000000));  // cash
  startDating(w, "harper", "graham");
  walkInto(w, "harper", "founders_row_3");
  walkInto(w, "graham", "founders_row_3");
  auto moved = w.respond("graham", ask(w, "harper", "move_in", "graham"), true);
  REQUIRE(moved);
  CHECK(moved.value().at("home").at("left").at("still_own") == true);
  CHECK((prop(w, "founders_row_3").residents == std::vector<CharacterId>{"harper", "graham"}));
  CHECK((prop(w, "willow_lane_8").owners == std::vector<CharacterId>{"graham"}));
  CHECK(prop(w, "willow_lane_8").residents.empty());
  CHECK(w.moveHome("graham", "willow_lane_8").error().code == "too_far");  // he's at Harper's
  // It's still his: he can let himself in, and move back whenever he likes.
  walkInto(w, "graham", "willow_lane_8");
  const Json app = w.openPhoneApp("graham", "homes").value();
  CHECK(app.at("home").at("property") == "founders_row_3");
  CHECK(app.at("also_own").at(0).at("owned_outright") == true);
  const Cents harper = bank(w, "harper");
  toNextMonth(w);
  CHECK(bank(w, "harper") == harper - 105000);  // $2,100 rent, split two ways
  REQUIRE(w.moveHome("graham", "willow_lane_8"));
  CHECK((prop(w, "founders_row_3").residents == std::vector<CharacterId>{"harper"}));
  CHECK(prop(w, "founders_row_3").tenant == "harper");
}

TEST_CASE("homes: a partner who moves back out of a rental leaves the lease with its holder") {
  World w = World::createNew(homesContent());
  for (const char* id : {"harper", "julian"}) REQUIRE(w.connect(id));
  startDating(w, "harper", "julian");
  walkInto(w, "harper", "founders_row_3");
  walkInto(w, "julian", "founders_row_3");
  REQUIRE(w.respond("julian", ask(w, "harper", "move_in", "julian"), true));
  CHECK(prop(w, "riverside_lofts_5").tenant.empty());  // his own lease ended
  auto out = w.moveOut("julian");
  REQUIRE(out);
  CHECK(!out.value().contains("lease"));  // it was never his
  CHECK(out.value().at("still_own") == false);
  CHECK(out.value().at("note").get<std::string>().find("You can still play") != std::string::npos);
  CHECK(prop(w, "founders_row_3").tenant == "harper");
  CHECK((prop(w, "founders_row_3").residents == std::vector<CharacterId>{"harper"}));
  CHECK(notified(w, "harper", "Julian moved out of"));
  CHECK(!notified(w, "harper", "The lease is yours now."));
  CHECK(w.openPhoneApp("julian", "homes").value().at("home").is_null());
  // He's still her partner, so he may stay over; the rent is hers alone again.
  CHECK(w.character("julian")->inside == "founders_row_3");
  const Cents harper = bank(w, "harper");
  const Cents julian = bank(w, "julian");
  toNextMonth(w);
  CHECK(bank(w, "harper") == harper - 210000);
  CHECK(bank(w, "julian") == julian);
  CHECK(w.state().ledger.sumOfBalances() == 0);
}

TEST_CASE("homes: selling pays off the mortgage and splits the rest") {
  World w = World::createNew(homesContent());
  for (const char* id : {"dominique", "dax", "harper"}) REQUIRE(w.connect(id));
  w = withBank(w, {{"dominique", 6000000}});
  walkTo(w, "dominique", "lakeview_1a");
  REQUIRE(w.buyHome("dominique", "lakeview_1a"));  // $260,000: $26,000 down, $234,000 borrowed
  toNextMonth(w);                                  // one payment made
  const Cents owed = prop(w, "lakeview_1a").mortgage->balanceCents;
  CHECK(owed == 23400000 + 117000 - 140295);
  CHECK(w.sellHome("dax", "lakeview_1a").error().code == "not_owner");
  CHECK(w.sellHome("dominique", "atlantis").error().code == "unknown_property");
  const Cents lender = balance(w, kLender);
  const Cents mine = bank(w, "dominique");
  const Cents economy = balance(w, kEconomyAccount);
  auto sold = w.sellHome("dominique", "lakeview_1a");
  REQUIRE(sold);
  CHECK(sold.value().at("price_cents") == 26000000);
  CHECK(sold.value().at("mortgage_paid_off_cents") == owed);
  CHECK(sold.value().at("your_share_cents") == 26000000 - owed);
  CHECK(sold.value().at("note").get<std::string>().find("You can still play") != std::string::npos);
  CHECK(bank(w, "dominique") == mine + 26000000 - owed);
  CHECK(balance(w, kLender) == lender + owed);
  CHECK(balance(w, kEconomyAccount) == economy - 26000000);  // the market bought it
  {
    const PropertyState& p = prop(w, "lakeview_1a");
    CHECK(p.owners.empty());
    CHECK(p.residents.empty());
    CHECK(!p.mortgage.has_value());
    CHECK(p.ownerAccount == kEconomyAccount);
  }
  const Json market = w.openPhoneApp("dax", "homes").value();
  const Json* relisted = listing(market, "lakeview_1a");
  REQUIRE(relisted);
  CHECK(relisted->at("seller") == "the market");

  // Owing more than it's worth, you can't sell.
  {
    WorldState s = w.state();
    PropertyState& p = s.properties.at("lakeview_2b");
    p.owners = {"dax"};
    p.tenant = "dax";
    p.mortgage = MortgageState{kLender, 30000000, 30000000, 180000, 0.06, 360, 300, 0, 0, 0};
    World v(w.contentPtr(), s);
    CHECK(v.sellHome("dax", "lakeview_2b").error().code == "underwater");
  }

  // A home owned together needs both owners' yes, and they split what's left.
  toMorning(w);
  startDating(w, "dax", "dominique");
  w = withBank(w, {{"dax", 5000000}, {"dominique", 5000000}});
  walkTo(w, "dax", "willow_lane_6");
  walkTo(w, "dominique", "willow_lane_6");
  REQUIRE(w.respond("dominique", ask(w, "dax", "buy_home", "dominique", "willow_lane_6"), true));  // $475,000
  CHECK(w.sellHome("dax", "willow_lane_6").error().code == "co_owned");
  walkTo(w, "harper", "willow_lane_6");
  CHECK(w.request("dax", "sell_home", "harper", false, "willow_lane_6").error().code == "not_co_owner");
  CHECK(w.request("harper", "sell_home", "dax", false, "willow_lane_6").error().code == "not_owner");
  const Cents dax = bank(w, "dax");
  const Cents dom = bank(w, "dominique");
  auto yes = w.respond("dominique", ask(w, "dax", "sell_home", "dominique", "willow_lane_6"), true);
  REQUIRE(yes);
  const Json home = yes.value().at("home");
  CHECK(home.at("mortgage_paid_off_cents") == 47500000 - 4750000);
  CHECK(home.at("your_share_cents") == 2375000);
  CHECK(bank(w, "dax") == dax + 2375000);
  CHECK(bank(w, "dominique") == dom + 2375000);
  CHECK(notified(w, "dax", "6 Willow Lane is sold. Your share, $23750.00, is in your bank account."));
  CHECK(prop(w, "willow_lane_6").owners.empty());
  CHECK(prop(w, "willow_lane_6").residents.empty());
  CHECK(w.openPhoneApp("dax", "homes").value().at("home").is_null());
  CHECK(w.openPhoneApp("dominique", "homes").value().at("home").is_null());
  CHECK(w.state().ledger.sumOfBalances() == 0);
}

TEST_CASE("homes: children move with their parents, and the nanny's key follows the family") {
  World w = withChild(homesContent(), 7);
  for (const char* id : {"dominique", "dax"}) REQUIRE(w.connect(id));
  // The family's nanny (hired as in the family tests) has a key to the apartment.
  std::ifstream in(std::string(LIVERA_DATA_DIR) + "/../scripts/demo/sol_rivera.json");
  Json sheet = Json::parse(in);
  sheet["career"] = "nanny";
  auto sol = w.createCharacter(sheet);
  REQUIRE(sol);
  const CharacterId nanny = sol.value();
  REQUIRE(w.connect(nanny));
  walkTo(w, "dominique", "little_sprouts");
  walkTo(w, nanny, "little_sprouts");
  auto offer = w.hireNanny("dominique", nanny);
  REQUIRE(offer);
  REQUIRE(w.respond(nanny, offer.value().at("request").get<std::string>(), true));
  CHECK(w.canAccess(nanny, place(w, "lexington_1204")));

  // Kai's parents buy a house together. He lived with his mother, so he moves with her.
  startDating(w, "dax", "dominique");
  w = withBank(w, {{"dax", 5000000}, {"dominique", 5000000}});
  walkTo(w, "dax", "willow_lane_6");
  walkTo(w, "dominique", "willow_lane_6");
  auto yes = w.respond("dominique", ask(w, "dax", "buy_home", "dominique", "willow_lane_6"), true);
  REQUIRE(yes);
  CHECK(w.definition(kChild)->homeProperty == "willow_lane_6");
  CHECK(yes.value().at("home").at("moved").at("dominique").at("children").at(0) == kChild);
  CHECK(w.character(kChild)->inside == "willow_lane_6");  // he was at home, so he comes along now
  w.advanceMinutes(60);
  CHECK(w.character(kChild)->inside == "willow_lane_6");  // and his routine keeps him there
  CHECK(w.canAccess(kChild, place(w, "willow_lane_6")));
  // Looking after him happens at the new house.
  walkInto(w, "dominique", "willow_lane_6");
  REQUIRE(w.careFor("dominique", kChild, "play"));
  CHECK(w.supervised(*w.character(kChild)));
  // The nanny's key follows the family: the new house, not the old apartment.
  CHECK(w.canAccess(nanny, place(w, "willow_lane_6")));
  CHECK(w.canAccess(nanny, place(w, "lexington_1204")).error().code == "no_access");
  walkInto(w, nanny, "willow_lane_6");
  REQUIRE(w.startShift(nanny));
  REQUIRE(w.endShift(nanny));

  // They sell. The family has nowhere to live for now, and Kai leaves with them...
  walkInto(w, "dax", "willow_lane_6");
  REQUIRE(w.respond("dax", ask(w, "dominique", "sell_home", "dax", "willow_lane_6"), true));
  CHECK(w.definition(kChild)->homeProperty.empty());
  CHECK(w.character(kChild)->inside.empty());
  CHECK(w.character("dominique")->inside.empty());
  CHECK(w.canAccess(nanny, place(w, "willow_lane_6")).error().code == "no_access");
  // ...to their next home.
  w = withBank(w, {{"dominique", 6000000}});
  walkTo(w, "dominique", "lakeview_1a");
  REQUIRE(w.buyHome("dominique", "lakeview_1a"));
  CHECK(w.definition(kChild)->homeProperty == "lakeview_1a");
  w.advanceMinutes(60);
  CHECK(w.character(kChild)->inside == "lakeview_1a");
  CHECK(w.canAccess(nanny, place(w, "lakeview_1a")));
  CHECK(w.state().ledger.sumOfBalances() == 0);
}

TEST_CASE("homes: a parent moves in with a partner, and the children and the nanny's key come along") {
  World w = withChild(homesContent(), 7);
  for (const char* id : {"dominique", "dax", "graham"}) REQUIRE(w.connect(id));
  startDating(w, "dax", "dominique");
  startDating(w, "dominique", "graham");
  // The family's nanny (hired as in the family tests) has a key to the apartment.
  std::ifstream in(std::string(LIVERA_DATA_DIR) + "/../scripts/demo/sol_rivera.json");
  Json sheet = Json::parse(in);
  sheet["career"] = "nanny";
  auto sol = w.createCharacter(sheet);
  REQUIRE(sol);
  const CharacterId nanny = sol.value();
  REQUIRE(w.connect(nanny));
  walkTo(w, "dominique", "little_sprouts");
  walkTo(w, nanny, "little_sprouts");
  auto offer = w.hireNanny("dominique", nanny);
  REQUIRE(offer);
  REQUIRE(w.respond(nanny, offer.value().at("request").get<std::string>(), true));

  // Dax asks Dominique to move in, the two of them at his door.
  walkTo(w, "dax", "maple_court_3b");
  walkTo(w, "dominique", "maple_court_3b");
  const std::string q = ask(w, "dax", "move_in", "dominique");
  CHECK(notified(w, "dominique", "Dax is asking you to move in together at Maple Court, Unit 3B."));
  CHECK(notified(w, "dominique", "Your lease on The Lexington, Apt 1204 would end."));
  CHECK(notified(w, "dominique", "The rent, $1350.00 a month, would be split 2 ways."));
  auto yes = w.respond("dominique", q, true);
  REQUIRE(yes);
  const Json mv = yes.value().at("home");
  CHECK(mv.at("left").at("lease") == "ended");
  CHECK(mv.at("left").at("children").at(0) == kChild);
  CHECK(mv.at("rent_share_cents") == 67500);
  CHECK((prop(w, "maple_court_3b").residents == std::vector<CharacterId>{"dax", "dominique"}));
  CHECK(prop(w, "maple_court_3b").tenant == "dax");
  CHECK(prop(w, "lexington_1204").tenant.empty());  // vacant again
  CHECK(prop(w, "lexington_1204").residents.empty());
  // Kai lived with his mother, so he moves too; he was home, so he's in the new place now.
  CHECK(w.definition(kChild)->homeProperty == "maple_court_3b");
  CHECK(w.character(kChild)->inside == "maple_court_3b");
  CHECK(w.canAccess(kChild, place(w, "maple_court_3b")));
  CHECK(w.canAccess(kChild, place(w, "lexington_1204")).error().code == "no_access");
  // The nanny's key follows the family.
  CHECK(w.canAccess(nanny, place(w, "maple_court_3b")));
  CHECK(w.canAccess(nanny, place(w, "lexington_1204")).error().code == "no_access");
  // It's her home now: her own key, her share of the rent.
  REQUIRE(w.enter("dominique", "maple_court_3b"));
  const Json app = w.openPhoneApp("dominique", "homes").value();
  CHECK(app.at("home").at("property") == "maple_court_3b");
  CHECK(app.at("home").at("tenure") == "renting");
  CHECK(app.at("home").at("rent").at("your_share_cents") == 67500);
  CHECK(app.at("home").at("rent").at("split_between") == 2);

  // She doesn't hold the lease here, so she can't ask anyone else to move in.
  walkTo(w, "graham", "maple_court_3b");
  REQUIRE(w.exitBuilding("dominique"));
  CHECK(w.request("dominique", "move_in", "graham").error().code == "not_your_home");

  // Dax buys a condo of his own and moves there. She's told, and the lease is hers now.
  w = withBank(w, {{"dax", 6000000}});
  walkTo(w, "dax", "lakeview_1a");
  auto bought = w.buyHome("dax", "lakeview_1a");
  REQUIRE(bought);
  CHECK(bought.value().at("moved").at("dax").at("lease") == "passed to dominique");
  CHECK(notified(w, "dominique",
                 "Dax moved out of Maple Court, Unit 3B to live at Lakeview Condos, Unit 1A. The lease is yours now."));
  CHECK(prop(w, "maple_court_3b").tenant == "dominique");
  CHECK((prop(w, "maple_court_3b").residents == std::vector<CharacterId>{"dominique"}));
  CHECK(w.definition(kChild)->homeProperty == "maple_court_3b");  // his mother still lives there
  CHECK(w.canAccess(nanny, place(w, "maple_court_3b")));

  // She moves out with nowhere to go: Kai goes to his father's.
  walkInto(w, "dominique", "maple_court_3b");
  auto out = w.moveOut("dominique");
  REQUIRE(out);
  CHECK(out.value().at("lease") == "ended");
  CHECK(out.value().at("children").at(0) == kChild);
  CHECK(out.value().at("note").get<std::string>().find("You can still play") != std::string::npos);
  CHECK(w.definition(kChild)->homeProperty == "lakeview_1a");
  CHECK(w.character(kChild)->inside == "lakeview_1a");
  CHECK(w.canAccess(kChild, place(w, "lakeview_1a")));
  CHECK(prop(w, "maple_court_3b").tenant.empty());
  CHECK(w.character("dominique")->inside.empty());
  // The nanny works for her, and she has no home now: no key anywhere.
  CHECK(w.canAccess(nanny, place(w, "maple_court_3b")).error().code == "no_access");
  CHECK(w.canAccess(nanny, place(w, "lakeview_1a")).error().code == "no_access");
  CHECK(w.state().ledger.sumOfBalances() == 0);
}

TEST_CASE("homes: a yes that can't go through still tells the asker why") {
  World w = World::createNew(homesContent());
  for (const char* id : {"dominique", "dax", "graham"}) REQUIRE(w.connect(id));
  startDating(w, "dax", "dominique");
  w = withBank(w, {{"dax", 3000000}, {"dominique", 3000000}, {"graham", 50000000}});
  for (const char* id : {"dax", "dominique", "graham"}) walkTo(w, id, "willow_lane_2");
  const std::string q = ask(w, "dax", "buy_home", "dominique", "willow_lane_2");
  CHECK(notified(w, "dominique", "Dax wants to buy 2 Willow Lane with you: $420000.00, $21000.00 down each"));
  // Graham gets there first, paying cash.
  REQUIRE(w.buyHome("graham", "willow_lane_2", 42000000));
  CHECK(w.respond("dominique", q, true).error().code == "sold");
  CHECK(notified(w, "dax", "Dominique said yes, but it couldn't go through: 2 Willow Lane has already been sold."));
  CHECK(w.respond("dominique", q, true).error().code == "unknown_request");  // the ask is closed
  CHECK(bank(w, "dax") == 3000000);
  CHECK(bank(w, "dominique") == 3000000);

  // They break up before she answers a second ask.
  walkTo(w, "dax", "willow_lane_4");
  walkTo(w, "dominique", "willow_lane_4");
  const std::string again = ask(w, "dax", "buy_home", "dominique", "willow_lane_4");
  REQUIRE(w.endRelationship("dominique", "dax"));
  CHECK(w.respond("dominique", again, true).error().code == "not_partners");
  CHECK(notified(w, "dax", "Dominique said yes, but it couldn't go through: you're not together anymore."));
  CHECK(prop(w, "willow_lane_4").owners.empty());
  CHECK(w.state().ledger.sumOfBalances() == 0);
}

TEST_CASE("homes: who lives where, who owns what and the mortgages are saved") {
  auto path = tempPath("homes.db");
  WorldState saved;
  {
    World w = withChild(homesContent(), 6);
    for (const char* id : {"dominique", "dax", "harper", "julian"}) REQUIRE(w.connect(id));
    // Dominique and Dax buy a house together and miss a payment; Kai moves with his mother.
    startDating(w, "dax", "dominique");
    w = withBank(w, {{"dax", 3000000}, {"dominique", 3000000}});
    walkTo(w, "dax", "willow_lane_4");
    walkTo(w, "dominique", "willow_lane_4");
    REQUIRE(w.respond("dominique", ask(w, "dax", "buy_home", "dominique", "willow_lane_4"), true));
    // Julian moves in with Harper.
    startDating(w, "harper", "julian");
    walkInto(w, "harper", "founders_row_3");
    walkInto(w, "julian", "founders_row_3");
    REQUIRE(w.respond("julian", ask(w, "harper", "move_in", "julian"), true));
    for (const char* id : {"dominique", "dax", "harper", "julian"}) w.disconnect(id);
    w = withBank(w, {{"dax", 0}, {"dominique", 0}});
    toNextMonth(w);
    REQUIRE(prop(w, "willow_lane_4").mortgage->missedPayments == 1);
    auto store = SqliteStore::open(path.string());
    REQUIRE(store);
    REQUIRE(store.value()->saveWorld(w.state()));
    saved = w.state();
  }
  auto store = SqliteStore::open(path.string());
  REQUIRE(store);
  auto loaded = store.value()->loadWorld();
  REQUIRE(loaded);
  const WorldState& s = loaded.value();
  for (const char* pid : {"willow_lane_4", "founders_row_3", "lexington_1204", "maple_court_3b", "riverside_lofts_5"}) {
    const PropertyState& a = s.properties.at(pid);
    const PropertyState& b = saved.properties.at(pid);
    CHECK(a.owners == b.owners);
    CHECK(a.residents == b.residents);
    CHECK(a.tenant == b.tenant);
    CHECK(a.ownerAccount == b.ownerAccount);
    CHECK(a.mortgage.has_value() == b.mortgage.has_value());
  }
  CHECK((s.properties.at("willow_lane_4").owners == std::vector<CharacterId>{"dax", "dominique"}));
  CHECK((s.properties.at("founders_row_3").residents == std::vector<CharacterId>{"harper", "julian"}));
  CHECK(s.properties.at("riverside_lofts_5").residents.empty());  // Julian's lease ended
  const MortgageState& m = *s.properties.at("willow_lane_4").mortgage;
  const MortgageState& sm = *saved.properties.at("willow_lane_4").mortgage;
  CHECK(m.lender == sm.lender);
  CHECK(m.principalCents == sm.principalCents);
  CHECK(m.balanceCents == sm.balanceCents);
  CHECK(m.paymentCents == sm.paymentCents);
  CHECK(m.annualRate == sm.annualRate);
  CHECK(m.termMonths == sm.termMonths);
  CHECK(m.monthsLeft == sm.monthsLeft);
  CHECK(m.missedPayments == 1);
  CHECK(m.arrearsCents == sm.arrearsCents);
  CHECK(m.startedAt == sm.startedAt);
  CHECK(s.createdCharacters.at(kChild).homeProperty == "willow_lane_4");
  CHECK(s.ledger.sumOfBalances() == 0);

  // The loaded world carries on: they catch up, and the rent is still split.
  World w(homesContent(), std::move(loaded).value());
  w = withBank(w, {{"dax", 5000000}, {"dominique", 5000000}});
  const Cents harper = bank(w, "harper");
  toNextMonth(w);
  CHECK(w.state().properties.at("willow_lane_4").mortgage->missedPayments == 0);
  CHECK(bank(w, "harper") == harper - 210000 / 2);
  CHECK(w.canAccess(kChild, place(w, "willow_lane_4")));

  // A save from before homes: only lease holders, no part. Everyone still lives where they did.
  WorldState old = World::createNew(homesContent()).state();
  for (auto& [pid, p] : old.properties) p.residents.clear();
  homesPartFromJson(old, Json::object());
  World upgraded(homesContent(), old);
  CHECK((upgraded.state().properties.at("lexington_1204").residents == std::vector<CharacterId>{"dominique"}));
  CHECK(upgraded.state().properties.at("willow_lane_2").residents.empty());
  // And the part round-trips on its own.
  const Json part = homesPartToJson(w.state());
  WorldState copy = w.state();
  for (auto& [pid, p] : copy.properties) {
    p.residents.clear();
    p.owners.clear();
    p.mortgage.reset();
  }
  homesPartFromJson(copy, part);
  for (const auto& [pid, p] : w.state().properties) {
    CHECK(copy.properties.at(pid).residents == p.residents);
    CHECK(copy.properties.at(pid).owners == p.owners);
    CHECK(copy.properties.at(pid).mortgage.has_value() == p.mortgage.has_value());
  }
}

TEST_CASE("homes: content rules for homes for sale") {
  auto refused = [](const std::function<void(Json&, const std::string&)>& patch) -> std::string {
    try {
      (void)patchedContent(patch);
    } catch (const std::runtime_error& e) {
      return e.what();
    }
    return "(loaded)";
  };
  CHECK(refused([](Json& doc, const std::string& file) {
          if (file == "homes_places.json") doc["properties"][0]["rent_monthly_cents"] = 100000;
        }).find("isn't rented") != std::string::npos);
  CHECK(refused([](Json& doc, const std::string& file) {
          if (file == "homes_places.json") doc["properties"][0].erase("market_value_cents");
        }).find("market_value_cents") != std::string::npos);
  CHECK(refused([](Json& doc, const std::string& file) {
          if (file == "homes_places.json") doc["homes"]["lender"] = "org:nobody";
        }).find("homes.lender") != std::string::npos);
  CHECK(refused([](Json& doc, const std::string& file) {
          if (file == "homes_places.json") doc["homes"]["min_down_payment"] = 0;
        }).find("min_down_payment") != std::string::npos);
  CHECK(refused([](Json& doc, const std::string& file) {
          if (file == "homes_places.json") doc.erase("homes");
        }).find("need a 'homes' section") != std::string::npos);
  // New arrivals are never housed in a home that's for sale, and nobody starts out living in one.
  CHECK(refused([](Json& doc, const std::string& file) {
          if (file == "homes_places.json") doc["properties"][0]["tier"] = "starter";
        }).find("has no tier") != std::string::npos);
  CHECK(refused([](Json& doc, const std::string& file) {
          if (file == "dominique.json") doc["characters"][0]["home"]["property"] = "willow_lane_2";
        }).find("which is for sale") != std::string::npos);
  CHECK(refused([](Json& doc, const std::string& file) {
          if (file == "homes_places.json") doc["locations"][0]["access"] = "public";
        }).find("residents-only") != std::string::npos);
  CHECK(refused([](Json& doc, const std::string& file) {
          if (file == "homes_places.json") doc["homes"]["term_months"] = 0;
        }).find("term_months") != std::string::npos);
  CHECK(refused([](Json&, const std::string&) {}) == "(loaded)");
}

namespace {

// Quick walking, and a 2% minimum down payment so the cast can buy without saving up first.
std::shared_ptr<const ContentDatabase> serverContent() {
  static auto db = patchedContent([](Json& doc, const std::string& file) {
    if (file == "simulation.json") doc["simulation"]["walk_speed_mps"] = 400.0;
    if (file == "homes_places.json") doc["homes"]["min_down_payment"] = 0.02;
  });
  return db;
}

class HomesServer {
 public:
  explicit HomesServer(const std::string& db) {
    ServerConfig cfg;
    cfg.port = 0;
    cfg.dbPath = db;
    cfg.content = serverContent();
    cfg.devCommands = true;
    cfg.passwordIterations = 1000;
    cfg.autosaveSeconds = 3600;
    auto s = Server::create(cfg);
    if (!s) throw std::runtime_error("server failed: " + s.error().message);
    server_ = std::move(s).value();
    port_ = server_->port();
    thread_ = std::thread([this] { server_->run(stop_); });
  }
  ~HomesServer() { stop(); }
  void stop() {
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

class HomesClient {
 public:
  explicit HomesClient(std::uint16_t port) {
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
      if (msg.contains("event")) {
        events.push_back(msg);
        continue;
      }
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
  void walkTo(const std::string& place) {
    ok({{"op", "move"}, {"location", place}});
    for (int i = 0; i < 100; ++i) {
      if (!ok({{"op", "look"}})["you"]["moving"].get<bool>()) return;
      std::this_thread::sleep_for(std::chrono::milliseconds(50));
    }
    throw std::runtime_error("never arrived at " + place);
  }
  void play(const std::string& user, const std::string& character, bool registered) {
    if (!registered) ok({{"op", "register"}, {"username", user}, {"password", "homes-pass-1"}});
    ok({{"op", "login"}, {"username", user}, {"password", "homes-pass-1"}});
    ok({{"op", "play"}, {"character", character}});
  }
  std::vector<Json> events;

 private:
  net::Fd fd_;
  net::LineBuffer buffer_;
  long id_ = 0;
};

}  // namespace

TEST_CASE(
    "server: buying a condo together, moving out and back, a restart, selling, buying alone and moving in, over the "
    "network") {
  const std::string db = tempPath("homes_server.db").string();
  {
    HomesServer server(db);
    HomesClient dom(server.port());
    HomesClient dax(server.port());
    dom.play("dom", "dominique", false);
    dax.play("dax", "dax", false);
    CHECK(dom.ok({{"op", "phone"}, {"app", "homes"}})["listings"].size() == 8);
    CHECK(dom.refusal({{"op", "buy_home"}, {"property", "lakeview_1a"}}) == "too_far");
    CHECK(dom.refusal({{"op", "buy_home"}, {"property", "lakeview_1a"}, {"down_payment_cents", "lots"}}) ==
          "bad_request");
    CHECK(dom.refusal({{"op", "move_home"}, {"property", "lakeview_1a"}}) == "not_owner");
    // They start dating at the café.
    for (HomesClient* c : {&dom, &dax}) {
      c->ok({{"op", "exit"}});
      c->walkTo("heritage_coffee");
      c->ok({{"op", "enter"}, {"location", "heritage_coffee"}});
    }
    const std::string date = dom.ok({{"op", "request"}, {"kind", "date"}, {"target", "dax"}})["request"];
    dax.ok({{"op", "respond"}, {"request", date}, {"accept", true}});
    // At the condo's door, Dax asks; Dominique says yes.
    for (HomesClient* c : {&dom, &dax}) {
      c->ok({{"op", "exit"}});
      c->walkTo("lakeview_1a");
    }
    CHECK(dax.refusal({{"op", "request"}, {"kind", "buy_home"}, {"target", "dominique"}}) == "unknown_property");
    const std::string buy = dax.ok(
        {{"op", "request"}, {"kind", "buy_home"}, {"target", "dominique"}, {"subject", "lakeview_1a"}})["request"];
    Json bought = dom.ok({{"op", "respond"}, {"request", buy}, {"accept", true}});
    CHECK(bought["home"]["bought"] == "lakeview_1a");
    CHECK(bought["home"]["down_payment_cents"] == 520000);  // 2% of $260,000
    dom.ok({{"op", "enter"}, {"location", "lakeview_1a"}});
    Json app = dom.ok({{"op", "phone"}, {"app", "homes"}});
    CHECK(app["home"]["property"] == "lakeview_1a");
    CHECK(app["home"]["tenure"] == "co-owner");
    CHECK(app["home"]["mortgage"]["your_share_cents"] == app["home"]["mortgage"]["payment_cents"].get<Cents>() / 2);
    // She moves out (still an owner) and back in.
    CHECK(dom.ok({{"op", "move_out"}})["still_own"] == true);
    CHECK(dom.ok({{"op", "move_home"}, {"property", "lakeview_1a"}})["moved_into"] == "lakeview_1a");
    CHECK(dax.refusal({{"op", "sell_home"}, {"property", "lakeview_1a"}}) == "co_owned");
  }
  // After a restart, the condo is still theirs, and so is the mortgage. They sell it together.
  {
    HomesServer server(db);
    HomesClient dom(server.port());
    HomesClient dax(server.port());
    dom.play("dom", "dominique", true);
    dax.play("dax", "dax", true);
    Json app = dom.ok({{"op", "phone"}, {"app", "homes"}});
    CHECK(app["home"]["property"] == "lakeview_1a");
    CHECK(app["home"]["owners"].size() == 2);
    CHECK(app["home"]["mortgage"]["months_left"] == 360);
    dax.ok({{"op", "enter"}, {"location", "lakeview_1a"}});
    const std::string sell = dax.ok(
        {{"op", "request"}, {"kind", "sell_home"}, {"target", "dominique"}, {"subject", "lakeview_1a"}})["request"];
    Json sold = dom.ok({{"op", "respond"}, {"request", sell}, {"accept", true}});
    CHECK(sold["home"]["sold"] == "lakeview_1a");
    CHECK(sold["home"]["your_share_cents"] == 260000);  // half of the $5,200 down payment back
    CHECK(dom.ok({{"op", "phone"}, {"app", "homes"}})["home"].is_null());
    CHECK(dom.refusal({{"op", "move_out"}}) == "no_home");
    // On her own now: she buys the condo next door (same building door) and asks Dax to move in.
    CHECK(dom.refusal({{"op", "buy_home"}, {"property", "lakeview_2b"}, {"down_payment_cents", 100}}) ==
          "down_payment_too_small");
    Json mine = dom.ok({{"op", "buy_home"}, {"property", "lakeview_2b"}});
    CHECK(mine["bought"] == "lakeview_2b");
    CHECK(mine["down_payment_cents"] == 550000);  // 2% of $275,000
    CHECK(mine["mortgage"]["principal_cents"] == 27500000 - 550000);
    CHECK(dax.refusal({{"op", "request"}, {"kind", "move_in"}, {"target", "dominique"}}) == "no_home");
    const std::string invite = dom.ok({{"op", "request"}, {"kind", "move_in"}, {"target", "dax"}})["request"];
    Json moved = dax.ok({{"op", "respond"}, {"request", invite}, {"accept", true}});
    CHECK(moved["home"]["moved_in"] == "lakeview_2b");
    dax.ok({{"op", "enter"}, {"location", "lakeview_2b"}});
    Json his = dax.ok({{"op", "phone"}, {"app", "homes"}});
    CHECK(his["home"]["tenure"] == "living with the owner");
    CHECK(his["home"]["residents"].size() == 2);
    CHECK(!his["home"].contains("mortgage"));  // her loan
  }
}
