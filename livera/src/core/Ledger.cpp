#include "core/Ledger.h"

#include <limits>

namespace livera {

Status Ledger::openAccount(LedgerAccount account) {
  if (account.id.empty()) return fail("ledger_invalid", "account id is empty");
  if (accounts_.count(account.id)) return fail("ledger_duplicate", "account already exists: " + account.id);
  if (account.balanceCents != 0) return fail("ledger_invalid", "accounts open at zero; fund them with a transfer");
  accounts_.emplace(account.id, std::move(account));
  return okStatus();
}

Result<std::string> Ledger::transfer(const LedgerAccountId& from, const LedgerAccountId& to, Cents amount,
                                     const std::string& kind, const std::string& memo, GameMinutes at) {
  if (amount <= 0) return fail("invalid_amount", "transfer amount must be positive");
  if (from == to) return fail("invalid_transfer", "cannot transfer to the same account");
  auto src = accounts_.find(from);
  auto dst = accounts_.find(to);
  if (src == accounts_.end()) return fail("unknown_account", "unknown account " + from);
  if (dst == accounts_.end()) return fail("unknown_account", "unknown account " + to);
  if (!src->second.allowNegative && src->second.balanceCents < amount) {
    return fail("insufficient_funds", "not enough money");
  }
  constexpr Cents kMax = std::numeric_limits<Cents>::max() / 4;
  if (dst->second.balanceCents > kMax - amount || src->second.balanceCents < -kMax + amount) {
    return fail("ledger_overflow", "balance out of range");
  }
  src->second.balanceCents -= amount;
  dst->second.balanceCents += amount;
  LedgerTransaction tx{"tx-" + std::to_string(nextTx_++), at, from, to, amount, kind, memo};
  transactions_.push_back(tx);
  return tx.id;
}

const LedgerAccount* Ledger::account(const LedgerAccountId& id) const {
  auto it = accounts_.find(id);
  return it == accounts_.end() ? nullptr : &it->second;
}

Cents Ledger::balance(const LedgerAccountId& id) const {
  const LedgerAccount* a = account(id);
  return a ? a->balanceCents : 0;
}

std::vector<LedgerTransaction> Ledger::history(const LedgerAccountId& id, std::size_t limit) const {
  std::vector<LedgerTransaction> out;
  for (auto it = transactions_.rbegin(); it != transactions_.rend() && out.size() < limit; ++it) {
    if (it->from == id || it->to == id) out.push_back(*it);
  }
  return out;
}

Cents Ledger::sumOfBalances() const {
  Cents total = 0;
  for (const auto& [id, a] : accounts_) total += a.balanceCents;
  return total;
}

void Ledger::restore(std::map<LedgerAccountId, LedgerAccount> accounts, std::vector<LedgerTransaction> txs,
                     std::uint64_t nextTx) {
  accounts_ = std::move(accounts);
  transactions_ = std::move(txs);
  nextTx_ = nextTx;
}

}  // namespace livera
