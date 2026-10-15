// The character creator: turns a player's submission into a new resident of Livéra.
// Every choice is checked against data/creator/*.json, so the client can only pick from
// what the game offers, and the origin ("Why did you move to Livéra?") sets the start.

#include <algorithm>
#include <set>

#include "core/World.h"

namespace livera {

namespace {

constexpr std::size_t kMaxNameBytes = 24;
constexpr std::size_t kMaxCustomBytes = 24;

// Names may contain letters (including accented UTF-8), spaces, hyphens, apostrophes and
// periods. No digits, no control characters, no markup.
bool validName(const std::string& s) {
  if (s.empty() || s.size() > kMaxNameBytes || s.front() == ' ' || s.back() == ' ') return false;
  for (unsigned char ch : s) {
    const bool ok = (ch >= 'a' && ch <= 'z') || (ch >= 'A' && ch <= 'Z') || ch >= 0x80 || ch == ' ' || ch == '-' ||
                    ch == '\'' || ch == '.';
    if (!ok) return false;
  }
  return true;
}

// Custom pronouns / gender identity: short, letters, spaces, slashes, hyphens.
bool validCustom(const std::string& s) {
  if (s.empty() || s.size() > kMaxCustomBytes) return false;
  for (unsigned char ch : s) {
    const bool ok = (ch >= 'a' && ch <= 'z') || (ch >= 'A' && ch <= 'Z') || ch >= 0x80 || ch == ' ' || ch == '/' ||
                    ch == '-';
    if (!ok) return false;
  }
  return true;
}

bool contains(const std::vector<std::string>& v, const std::string& x) {
  return std::find(v.begin(), v.end(), x) != v.end();
}

// One pick from a choice. Free text is accepted only where the choice allows it.
Result<std::string> pickOne(const Json& spec, const char* key, const CreatorChoice& choice) {
  if (!spec.contains(key) || !spec.at(key).is_string()) return fail("invalid_character", std::string(key) + " is required");
  const std::string v = spec.at(key).get<std::string>();
  if (contains(choice.options, v)) return v;
  if (choice.allowCustom && validCustom(v)) return v;
  return fail("invalid_character", std::string(key) + ": '" + v + "' isn't an option");
}

// Several distinct picks from a choice, between choice.min and choice.max of them.
Result<std::vector<std::string>> pickMany(const Json& spec, const char* key, const CreatorChoice& choice) {
  std::vector<std::string> out;
  if (spec.contains(key)) {
    if (!spec.at(key).is_array()) return fail("invalid_character", std::string(key) + " must be a list");
    for (const auto& v : spec.at(key)) {
      if (!v.is_string() || !contains(choice.options, v.get<std::string>()))
        return fail("invalid_character", std::string(key) + ": '" + v.dump() + "' isn't an option");
      if (contains(out, v.get<std::string>())) return fail("invalid_character", std::string(key) + ": duplicate pick");
      out.push_back(v.get<std::string>());
    }
  }
  if (static_cast<int>(out.size()) < choice.min || static_cast<int>(out.size()) > choice.max)
    return fail("invalid_character", std::string(key) + ": pick " + std::to_string(choice.min) + " to " +
                                         std::to_string(choice.max));
  return out;
}

// Personality and values: each stat 0..100 (missing = 50), and the total within budget, so
// nobody is simply "100 at everything".
Result<StatMap> allocate(const Json& spec, const char* key, const std::vector<std::string>& stats, double budget) {
  StatMap out;
  for (const auto& s : stats) out[s] = 50;
  if (spec.contains(key)) {
    if (!spec.at(key).is_object()) return fail("invalid_character", std::string(key) + " must be an object");
    for (const auto& [k, v] : spec.at(key).items()) {
      if (!out.count(k)) return fail("invalid_character", std::string(key) + ": unknown '" + k + "'");
      if (!v.is_number()) return fail("invalid_character", std::string(key) + "." + k + " must be a number");
      const double x = v.get<double>();
      if (x < 0 || x > 100) return fail("invalid_character", std::string(key) + "." + k + " must be 0-100");
      out[k] = x;
    }
  }
  double total = 0;
  for (const auto& [k, v] : out) total += v;
  if (total > budget + 1e-9)
    return fail("invalid_character", std::string(key) + ": " + std::to_string(static_cast<int>(total)) +
                                         " points used, budget is " + std::to_string(static_cast<int>(budget)));
  return out;
}

// Readable, stable ids from names: "Sol Rivera" -> "sol-rivera". Common accented Latin
// letters fold to ASCII; anything else becomes a separator.
std::string slugify(const std::string& name) {
  static const char* kFold =  // UTF-8 C3 80..C3 BF -> ASCII (À..ÿ)
      "aaaaaaaceeeeiiiidnooooo-ouuuuyts"
      "aaaaaaaceeeeiiiidnooooo-ouuuuyty";
  std::string out;
  for (std::size_t i = 0; i < name.size(); ++i) {
    const auto ch = static_cast<unsigned char>(name[i]);
    char mapped = '-';
    if ((ch >= 'a' && ch <= 'z') || (ch >= '0' && ch <= '9')) mapped = static_cast<char>(ch);
    else if (ch >= 'A' && ch <= 'Z') mapped = static_cast<char>(ch - 'A' + 'a');
    else if (ch == 0xC3 && i + 1 < name.size()) {
      const auto next = static_cast<unsigned char>(name[i + 1]);
      if (next >= 0x80 && next <= 0xBF) mapped = kFold[next - 0x80];
      ++i;
    }
    if (mapped == '-' && (out.empty() || out.back() == '-')) continue;
    out.push_back(mapped);
  }
  while (!out.empty() && out.back() == '-') out.pop_back();
  return out.empty() ? "resident" : out;
}

}  // namespace

Json World::creatorOptions() const {
  const CreatorOptions& c = content_->creator();
  auto choice = [](const CreatorChoice& ch) {
    return Json{{"options", ch.options}, {"min", ch.min}, {"max", ch.max}, {"allow_custom", ch.allowCustom}};
  };
  Json appearance = Json::object();
  for (const auto& [field, ch] : c.appearance) appearance[field] = choice(ch);
  Json origins = Json::array();
  for (const auto& [id, o] : content_->origins()) {
    origins.push_back(Json{{"id", id},
                           {"label", o.label},
                           {"description", o.description},
                           {"bank_cents", o.bankCents},
                           {"cash_cents", o.cashCents},
                           {"housing", o.housingTier}});
  }
  Json careers = Json::array();
  for (const auto& [id, career] : content_->careers()) {
    if (!career.entryLevel || career.workplaces.empty()) continue;
    Json workplaces = Json::array();
    for (const auto& w : career.workplaces) workplaces.push_back(content_->location(w)->name);
    careers.push_back(Json{{"id", id}, {"name", career.name}, {"starting_title", career.levels.front().title},
                           {"hourly_cents", career.levels.front().hourlyCents}, {"workplaces", workplaces}});
  }
  const SimulationConfig& sim = content_->sim();
  return Json{{"age", {c.minAge, c.maxAge}},
              {"height_cm", {c.minHeightCm, c.maxHeightCm}},
              {"pronouns", choice(c.pronouns)},
              {"gender", choice(c.gender)},
              {"appearance", appearance},
              {"traits", choice(c.traits)},
              {"interests", choice(c.interests)},
              {"education", choice(c.education)},
              {"relationship_status", choice(c.relationshipStatus)},
              {"goals", choice(c.goals)},
              {"reproduction", choice(c.reproduction)},
              {"personality", sim.personalityTraits},
              {"personality_budget", c.personalityBudget},
              {"values", sim.values},
              {"values_budget", c.valuesBudget},
              {"max_background_length", c.maxBackgroundLength},
              {"origins", origins},
              {"careers", careers}};
}

Result<CharacterId> World::createCharacter(const Json& spec) {
  const ContentDatabase& db = *content_;
  const CreatorOptions& opts = db.creator();
  if (!spec.is_object()) return fail("invalid_character", "expected a character sheet");
  if (db.origins().empty()) return fail("creator_unavailable", "this world has no character creator");

  // Wrong JSON types read as empty, so they fail validation instead of throwing.
  auto text = [&](const char* key) {
    auto it = spec.find(key);
    return it != spec.end() && it->is_string() ? it->get<std::string>() : std::string();
  };
  CharacterDef def;
  const std::string first = text("first_name");
  const std::string last = text("last_name");
  if (!validName(first) || !validName(last))
    return fail("invalid_character", "names use letters, spaces, hyphens and apostrophes (up to 24)");
  def.firstName = first;
  def.lastName = last;
  if (!spec.contains("age") || !spec.at("age").is_number_integer())
    return fail("invalid_character", "age is required");
  def.age = spec.at("age").get<int>();
  if (def.age < opts.minAge || def.age > opts.maxAge)
    return fail("invalid_character",
                "age must be " + std::to_string(opts.minAge) + "-" + std::to_string(opts.maxAge));

  auto pronouns = pickOne(spec, "pronouns", opts.pronouns);
  if (!pronouns) return pronouns.error();
  def.pronouns = pronouns.value();
  auto gender = pickOne(spec, "gender", opts.gender);
  if (!gender) return gender.error();
  def.gender = gender.value();

  // Appearance: every single-pick field is required; multi-pick fields may be empty.
  Json appearance = Json::object();
  const Json noAppearance = Json::object();
  const Json& look = spec.contains("appearance") && spec.at("appearance").is_object() ? spec.at("appearance") : noAppearance;
  for (const auto& [key, v] : look.items()) {
    if (key != "height_cm" && !opts.appearance.count(key))
      return fail("invalid_character", "appearance: unknown field '" + key + "'");
  }
  for (const auto& [field, choice] : opts.appearance) {
    if (choice.max == 1) {
      auto v = pickOne(look, field.c_str(), choice);
      if (!v) return fail("invalid_character", "appearance." + v.error().message);
      appearance[field] = v.value();
    } else {
      auto v = pickMany(look, field.c_str(), choice);
      if (!v) return fail("invalid_character", "appearance." + v.error().message);
      appearance[field] = v.value();
    }
  }
  if (!look.contains("height_cm") || !look.at("height_cm").is_number_integer())
    return fail("invalid_character", "appearance.height_cm is required");
  const int height = look.at("height_cm").get<int>();
  if (height < opts.minHeightCm || height > opts.maxHeightCm)
    return fail("invalid_character", "appearance.height_cm out of range");
  appearance["height_cm"] = height;

  auto personality = allocate(spec, "personality", db.sim().personalityTraits, opts.personalityBudget);
  if (!personality) return personality.error();
  def.personality = personality.value();
  auto values = allocate(spec, "values", db.sim().values, opts.valuesBudget);
  if (!values) return values.error();
  def.values = values.value();
  auto traits = pickMany(spec, "traits", opts.traits);
  if (!traits) return traits.error();
  def.traits = traits.value();
  auto interests = pickMany(spec, "interests", opts.interests);
  if (!interests) return interests.error();
  def.interests = interests.value();
  auto education = pickOne(spec, "education", opts.education);
  if (!education) return education.error();
  auto relationshipStatus = pickOne(spec, "relationship_status", opts.relationshipStatus);
  if (!relationshipStatus) return relationshipStatus.error();
  auto goals = pickMany(spec, "goals", opts.goals);
  if (!goals) return goals.error();
  // Optional: whether this person can become pregnant, get someone pregnant, or neither.
  if (spec.contains("reproduction") && !opts.reproduction.options.empty()) {
    auto rep = pickOne(spec, "reproduction", opts.reproduction);
    if (!rep) return rep.error();
    auto it = opts.reproductionMeaning.find(rep.value());
    def.reproduction = it == opts.reproductionMeaning.end() ? "" : it->second;
  }
  const std::string background = text("background");
  if (static_cast<int>(background.size()) > opts.maxBackgroundLength)
    return fail("invalid_character", "background is too long");
  for (unsigned char ch : background) {
    if (ch < 0x20 && ch != '\n') return fail("invalid_character", "background contains control characters");
  }

  const OriginDef* origin = db.origin(text("origin"));
  if (!origin) return fail("invalid_character", "choose why you moved to Livéra (origin)");
  const CareerDef* career = db.career(text("career"));
  if (!career || !career->entryLevel || career->workplaces.empty())
    return fail("invalid_character", "choose a starting career from the list");
  def.careerId = career->id;
  def.careerLevel = std::clamp(origin->careerLevelBonus, 0, static_cast<int>(career->levels.size()) - 1);
  def.startingBankCents = origin->bankCents;
  def.startingCashCents = origin->cashCents;

  // Housing: the first vacant home of the origin's tier.
  for (const auto& [pid, p] : state_.properties) {
    const PropertyDef* pd = db.property(pid);
    if (p.tenant.empty() && pd && pd->tier == origin->housingTier) {
      def.homeProperty = pid;
      def.spawnLocation = pd->location;
      break;
    }
  }
  if (def.homeProperty.empty()) return fail("no_housing", "no homes are available for new arrivals right now");

  std::string id = slugify(first + " " + last);
  for (int n = 2; definition(id) || state_.characters.count(id); ++n) id = slugify(first + " " + last) + "-" + std::to_string(n);
  def.id = id;
  def.playable = true;
  def.profile = Json{{"created", true},
                     {"why_livera", origin->id},
                     {"appearance", appearance},
                     {"education", education.value()},
                     {"relationship_status", relationshipStatus.value()},
                     {"goals", goals.value()},
                     {"background", background},
                     {"tagline", origin->label}};

  // What you studied before Livéra counts: a law degree means you can practise law here.
  if (auto it = db.education().creatorEducation.find(education.value()); it != db.education().creatorEducation.end())
    def.degrees = it->second;

  if (Status st = db.validateCharacter(def, [this](const std::string& other) { return definition(other) != nullptr; }); !st)
    return st.error();

  state_.createdCharacters[id] = def;
  addCharacterState(def, origin);
  Memory arrival;
  arrival.id = nextId("mem");
  arrival.owner = id;
  arrival.at = state_.now;
  arrival.participants = {id};
  arrival.location = def.spawnLocation;
  arrival.type = "life_change";
  arrival.importance = 80;
  arrival.emotionalImpact = 30;
  arrival.info = "Moved to Livéra: " + origin->label;
  addMemory(std::move(arrival));
  notify(id, "welcome", "Welcome to Livéra, " + first + ". Your keys are waiting at " +
                            db.location(def.spawnLocation)->name + ".");
  return id;
}

}  // namespace livera
