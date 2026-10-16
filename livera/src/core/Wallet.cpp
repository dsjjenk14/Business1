// Coins bought with real money, phones (models, battery) and LivPay (tap to pay, send money).
// M0.8 feature file: see docs/m08/wallet.md.
#include "core/Content.h"
#include "core/Parts.h"
#include "core/World.h"

namespace livera {

// ---- Content -------------------------------------------------------------------------------
Status ContentDatabase::ingestWallet(const std::string& source, const std::string& section, const Json& body, bool& handled) {
  (void)source;
  (void)section;
  (void)body;
  handled = false;
  return okStatus();
}

Status ContentDatabase::validateWallet() const { return okStatus(); }

// ---- Simulation ----------------------------------------------------------------------------
void World::stepWalletHourly() {}

Json World::phoneWallet(const CharacterState& c) const {
  (void)c;
  return Json::object();
}

Json World::phoneStore(const CharacterState& c) const {
  (void)c;
  return Json::object();
}

// ---- Save ----------------------------------------------------------------------------------
Json walletPartToJson(const WorldState& s) {
  (void)s;
  return Json::object();
}

void walletPartFromJson(WorldState& s, const Json& j) {
  (void)s;
  (void)j;
}

void writeWalletCharacter(const CharacterState& c, Json& j) {
  (void)c;
  (void)j;
}

void readWalletCharacter(CharacterState& c, const Json& j) {
  (void)c;
  (void)j;
}

}  // namespace livera
