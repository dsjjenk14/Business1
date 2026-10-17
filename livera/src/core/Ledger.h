#pragma once

#include <map>
#include <string>
#include <vector>

#include "core/Types.h"

namespace livera {

// Money moves only by transfer between two accounts, so the sum of all balances is
// always zero: the system account `sys:economy` stands for the outside world and is
// the only account allowed to go negative (it "mints" opening balances and salaries
// paid by off-screen employers). See docs/DECISIONS.md (D-008).
inline constexpr const char* kEconomyAccount = "sys:economy";

struct LedgerAccount {
  LedgerAccountId id;
  std::string ownerId;  // character id, org id, or "system"
  std::string kind;     // cash, bank, business, system
  Cents balanceCents = 0;
  bool allowNegative = false;
};

struct LedgerTransaction {
  std::string id;
  GameMinutes at = 0;
  LedgerAccountId from;
  LedgerAccountId to;
  Cents amountCents = 0;
  std::string kind;  // opening_balance, salary, purchase, rent, ...
  std::string memo;
};

class Ledger {
 public:
  Status openAccount(LedgerAccount account);
  // Atomic: either both balances change and the transaction is recorded, or nothing does.
  Result<std::string> transfer(const LedgerAccountId& from, const LedgerAccountId& to, Cents amount,
                               const std::string& kind, const std::string& memo, GameMinutes at);

  const LedgerAccount* account(const LedgerAccountId& id) const;
  Cents balance(const LedgerAccountId& id) const;
  // Most recent first.
  std::vector<LedgerTransaction> history(const LedgerAccountId& id, std::size_t limit) const;
  // Must always be 0. Checked by tests and before every save.
  Cents sumOfBalances() const;

  const std::map<LedgerAccountId, LedgerAccount>& accounts() const { return accounts_; }
  const std::vector<LedgerTransaction>& transactions() const { return transactions_; }
  std::uint64_t nextTxNumber() const { return nextTx_; }

  // Persistence restores raw state; it does not replay transfers.
  void restore(std::map<LedgerAccountId, LedgerAccount> accounts, std::vector<LedgerTransaction> txs,
               std::uint64_t nextTx);

 private:
  std::map<LedgerAccountId, LedgerAccount> accounts_;
  std::vector<LedgerTransaction> transactions_;
  std::uint64_t nextTx_ = 1;
};

}  // namespace livera
