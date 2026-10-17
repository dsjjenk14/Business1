#include "TestHarness.h"
#include "core/Ledger.h"

using namespace livera;

namespace {

Ledger fundedLedger() {
  Ledger l;
  (void)l.openAccount({kEconomyAccount, "system", "system", 0, true});
  (void)l.openAccount({"a", "alice", "bank", 0, false});
  (void)l.openAccount({"b", "bob", "bank", 0, false});
  (void)l.transfer(kEconomyAccount, "a", 10000, "opening_balance", "", 0);
  return l;
}

}  // namespace

TEST_CASE("ledger: transfers move money and record a transaction") {
  Ledger l = fundedLedger();
  auto tx = l.transfer("a", "b", 2500, "purchase", "coffee", 10);
  REQUIRE(tx);
  CHECK(l.balance("a") == 7500);
  CHECK(l.balance("b") == 2500);
  CHECK(l.history("b", 10).size() == 1);
  CHECK(l.history("b", 10).front().memo == "coffee");
}

TEST_CASE("ledger: overdraft is refused and nothing changes") {
  Ledger l = fundedLedger();
  const auto before = l.transactions().size();
  auto tx = l.transfer("a", "b", 10001, "purchase", "", 0);
  CHECK(!tx);
  CHECK(tx.error().code == "insufficient_funds");
  CHECK(l.balance("a") == 10000);
  CHECK(l.balance("b") == 0);
  CHECK(l.transactions().size() == before);
}

TEST_CASE("ledger: invalid transfers are refused") {
  Ledger l = fundedLedger();
  CHECK(!l.transfer("a", "b", 0, "x", "", 0));
  CHECK(!l.transfer("a", "b", -5, "x", "", 0));
  CHECK(!l.transfer("a", "a", 5, "x", "", 0));
  CHECK(!l.transfer("a", "nobody", 5, "x", "", 0));
  CHECK(!l.openAccount({"a", "dup", "bank", 0, false}));
  CHECK(!l.openAccount({"c", "c", "bank", 100, false}));  // cannot conjure money at open
}

TEST_CASE("ledger: money is conserved (balances always sum to zero)") {
  Ledger l = fundedLedger();
  CHECK(l.sumOfBalances() == 0);
  for (int i = 0; i < 50; ++i) {
    (void)l.transfer("a", "b", 137, "x", "", i);
    (void)l.transfer("b", "a", 61, "x", "", i);
    (void)l.transfer(kEconomyAccount, "b", 13, "salary", "", i);
  }
  CHECK(l.sumOfBalances() == 0);
}
