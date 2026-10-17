#pragma once

#include <optional>

#include "core/Types.h"

namespace livera::client {

// Walks a player through the character creator on the terminal, using the option lists the
// server sent (`creator_options`). Returns the character sheet to submit, or nothing if
// input ends. The server validates the sheet; the wizard only makes it easy to fill in.
std::optional<Json> runCreatorWizard(const Json& creatorOptions);

}  // namespace livera::client
