#pragma once

#include <string>

#include "core/World.h"

// The in-world request routing shared by the dedicated server and the single-player (WebAssembly)
// build: one JSON request in, the same `Result<Json>` out, so a solo game answers exactly like a
// live one. Everything that needs a session, an account or the store (login, `play`, `buy_coins`)
// stays with the caller. Argument parsing may throw (a string where a number belongs); the caller
// turns that into `bad_request`, as Server::handleLine does.
namespace livera::protocol {

// A string argument, or "" when absent or not a string.
std::string str(const Json& req, const char* key);

// Routes one in-world op for `me`, who must be playing. Unknown ops answer `unknown_op`.
Result<Json> dispatchWorldOp(World& world, const CharacterId& me, const std::string& op, const Json& req);

}  // namespace livera::protocol
