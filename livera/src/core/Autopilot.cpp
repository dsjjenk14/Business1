// The autopilot: scripts/town_director.py ported into the core. Same day planning, same habits,
// same manners (one command at a time, backoff on refusals, asks declined, bed at night). Where
// the director reads the server's replies, this reads the same views (look, the phone apps, the
// map's status) through World's const queries, and never WorldState itself.

#include "core/Autopilot.h"

#include <algorithm>
#include <cctype>
#include <cmath>
#include <cstdint>
#include <cstdio>
#include <map>
#include <optional>
#include <set>
#include <sstream>
#include <tuple>

#include "core/Clock.h"
#include "core/ContentParse.h"
#include "core/DayHash.h"
#include "core/Schedule.h"

namespace livera {

// ---- Content: the autopilot's manners (data/society/manners.json) -------------------------------
Status ContentDatabase::ingestManners(const std::string& source, const std::string& section, const Json& body,
                                      bool& handled) {
  handled = section == "autopilot_manners";
  if (!handled) return okStatus();
  if (haveManners_) return fail("content_duplicate", source + ": 'autopilot_manners' defined twice");
  haveManners_ = true;
  try {
    AutopilotMannersConfig& M = manners_;
    const Json greet = body.value("greet", Json::object());
    M.greetRangeMeters = greet.value("range_m", M.greetRangeMeters);
    M.greetKnown = content_parse::readStrings(greet, "known");
    M.greetStranger = content_parse::readStrings(greet, "stranger");
    const Json chat = body.value("chat", Json::object());
    M.chatInteraction = chat.value("interaction", "");
    M.chatTrait = chat.value("trait", "");
    M.chatBase = chat.value("base", 0.0);
    M.chatPerTrait = chat.value("per_trait", 0.0);
    M.chatPerFriendship = chat.value("per_friendship", 0.0);
    for (const auto& a : body.value("asks", Json::array()))
      M.asks.push_back(AutopilotAskRule{a.at("kind").get<std::string>(), content_parse::readStats(a, "min")});
  } catch (const std::exception& e) {
    return fail("content_invalid", source + ": " + e.what());
  }
  return okStatus();
}

Status ContentDatabase::validateManners() const {
  const AutopilotMannersConfig& M = manners_;
  // A greeting nobody could hear would be a script talking to itself.
  if (M.greetRangeMeters < 0 || M.greetRangeMeters > sim_.hearingRangeMeters)
    return fail("content_invalid", "autopilot_manners.greet.range_m must be within the say range (hearing_range_m)");
  if (M.greetKnown.empty() != M.greetStranger.empty())
    return fail("content_invalid", "autopilot_manners.greet needs lines for people they know and for strangers");
  for (const auto& lines : {M.greetKnown, M.greetStranger}) {
    for (const auto& l : lines) {
      if (l.empty() || static_cast<int>(l.size()) > sim_.maxSpeechLength)
        return fail("content_invalid", "autopilot_manners.greet: a line is empty or too long to say");
    }
  }
  if (!M.chatInteraction.empty() && !interaction(M.chatInteraction))
    return fail("content_invalid", "autopilot_manners.chat: unknown interaction '" + M.chatInteraction + "'");
  const auto& traits = sim_.personalityTraits;
  if (!M.chatTrait.empty() && std::find(traits.begin(), traits.end(), M.chatTrait) == traits.end())
    return fail("content_invalid", "autopilot_manners.chat: unknown personality trait '" + M.chatTrait + "'");
  for (double p : {M.chatBase, M.chatPerTrait, M.chatPerFriendship}) {
    if (p < 0 || p > 1) return fail("content_invalid", "autopilot_manners.chat: chances are 0-1");
  }
  const std::set<std::string> kinds{"date", "kiss", "propose", "marry", "buy_home", "move_in", "sell_home", "nanny"};
  const std::set<std::string> dims(sim_.relationshipDimensions.begin(), sim_.relationshipDimensions.end());
  std::set<std::string> seen;
  for (const auto& a : M.asks) {
    // Rule 6 and D-025: a script never consents to intimacy for a character, whatever the data says.
    if (a.kind == "intimacy") return fail("content_invalid", "autopilot_manners.asks: never intimacy");
    if (!kinds.count(a.kind))
      return fail("content_invalid", "autopilot_manners.asks: unknown ask kind '" + a.kind + "'");
    if (!seen.insert(a.kind).second) return fail("content_duplicate", "autopilot_manners.asks: '" + a.kind + "' twice");
    for (const auto& [dim, v] : a.min) {
      if (!dims.count(dim))
        return fail("content_invalid", "autopilot_manners.asks." + a.kind + ": unknown dimension '" + dim + "'");
    }
  }
  return okStatus();
}

namespace {

// Tunables (game minutes unless noted). Here, not in data/, because they describe how the autopilot
// behaves, not the world. Kept equal to the director's so both play the town the same way.
constexpr int kWakeBeforeFirst = 60;  // wake this long before the first scheduled thing
constexpr int kWakeEarliest = 5 * 60 + 30;
constexpr int kWakeLatest = 9 * 60;
constexpr int kBedAfterLast = 120;  // go to bed this long after the last scheduled thing
constexpr int kBedEarliest = 22 * 60 + 30;
constexpr int kBedLatest = 23 * 60 + 45;
constexpr int kVisitMax = 150;         // a scheduled visit lasts at most this long, then home
constexpr int kWaitForOpening = 45;    // wait at a closed door only if it opens within this
constexpr int kTravelSlack = 4;        // leave for the next thing this much before the travel estimate
constexpr double kBusMinSavingSeconds = 10;  // real seconds the bus must save over walking
constexpr double kBusMinDistanceMeters = 250;  // never the bus for a shorter trip
constexpr Cents kEverydayMaxCents = 1500;      // an "everyday thing" costs at most this
constexpr double kCommandIntervalSeconds = 2;  // real seconds between a character's turns
constexpr double kIdleCapSeconds = 20;         // look again at least this often (a dev time skip moves the clock)
constexpr double kHeldSeconds = 30;            // in a cell: look again about this often

const std::map<std::string, double> kNeedUrgent{{"bladder", 30}, {"hunger", 25}, {"energy", 10}};
const std::map<std::string, double> kNeedRecovered{{"bladder", 60}, {"hunger", 50}, {"energy", 30}};
const std::map<std::string, double> kHomeCare{
    {"bladder", 50}, {"hunger", 50}, {"hygiene", 45}, {"energy", 40}, {"dental", 40}};
// Energy care (D-073): a rest at home before a shift or an evening out, a coffee or the break room on a long shift,
// the restroom at work. A town staffed in the evening needs people who aren't spent by six.
const std::map<std::string, double> kRestBefore{{"energy", 70}, {"hunger", 60}, {"bladder", 70}};
constexpr int kRestWithinMinutes = 180;   // the next shift or evening out starts within this (two naps)
constexpr double kPickMeUpBelow = 35;     // on shift: a coffee or the break room under this energy
constexpr double kPatrolCoffeeBelow = 50; // on the beat: in for a coffee under this energy, where one is sold
constexpr int kPickMeUpEveryMinutes = 45; // game minutes between pick-me-ups
const std::map<std::string, double> kShiftCare{{"bladder", 40}};
const std::map<std::string, double> kMorningCare{{"bladder", 95}, {"dental", 90}, {"hygiene", 80}, {"hunger", 80}};
const std::map<std::string, double> kBedCare{{"bladder", 95}, {"dental", 90}};

enum class Kind { Home, Work, Place, Sleep };

// What a character is after.
struct Goal {
  Kind kind = Kind::Home;
  LocationId place;
  std::string activity;
  std::string why;
  int start = 0;
  int end = 0;
  int index = -1;      // its position in the day's blocks; -1 when it isn't one of them
  bool habit = false;  // a director habit, not character data
  bool errand = false;  // an urgent need being dealt with
  bool evening = false;  // an evening out from data/society/town_life.json (D-073)
  std::string offer;     // an offer to buy there (an evening's dinner, a film)
  std::string ident() const {
    return std::to_string(static_cast<int>(kind)) + ":" + place + ":" + activity + ":" + std::to_string(start);
  }
};

struct DayPlan {
  std::int64_t day = -1;
  int weekday = 0;
  int wake = 0;
  int bed = 0;
  std::vector<Goal> blocks;
  std::set<int> skipped;
  bool awake(int mod) const { return wake <= mod && mod < bed; }
  const Goal* current(int mod) const {
    for (const auto& b : blocks) {
      if (b.start <= mod && mod < b.end) return &b;
    }
    return nullptr;
  }
  bool has(const Goal& g) const { return !g.errand && g.index >= 0 && g.index < static_cast<int>(blocks.size()); }
};

std::string hhmm(int minuteOfDay) {
  const int m = ((minuteOfDay % 1440) + 1440) % 1440;
  char buf[8];
  std::snprintf(buf, sizeof buf, "%02d:%02d", m / 60, m % 60);
  return buf;
}

// --- Matching schedule text ("Gym or a run in Founders Park") to places, by name ----------------
const std::set<std::string> kGeneric{"the", "a", "an", "and", "or", "of", "at", "in", "on", "to", "with", "co",
                                     "apt", "unit", "for", "by", "her", "his", "their", "she", "he", "it", "when",
                                     "whatever", "use", "take", "practice", "go", "s", "inc", "my", "your"};
const std::map<std::string, std::string> kSynonyms{{"run", "jog"}};

// Lower-cased ASCII letters and digits, accents stripped (Livéra -> livera), everything else a space.
std::string foldAscii(const std::string& text) {
  static const char* const kLatin1[64] = {  // U+00C0..U+00FF
      "a", "a", "a", "a", "a", "a", "ae", "c", "e", "e", "e", "e", "i", "i", "i", "i", "d", "n", "o", "o", "o", "o",
      "o", "", "o", "u", "u", "u", "u", "y", "", "ss", "a", "a", "a", "a", "a", "a", "ae", "c", "e", "e", "e", "e",
      "i", "i", "i", "i", "d", "n", "o", "o", "o", "o", "o", "", "o", "u", "u", "u", "u", "y", "", "y"};
  std::string out;
  for (std::size_t i = 0; i < text.size(); ++i) {
    const unsigned char ch = static_cast<unsigned char>(text[i]);
    if (ch == 0xC3 && i + 1 < text.size()) {
      const unsigned char next = static_cast<unsigned char>(text[i + 1]);
      if (next >= 0x80 && next <= 0xBF) {
        out += kLatin1[next - 0x80];
        ++i;
        continue;
      }
    }
    if (std::isalnum(ch) && ch < 0x80) out += static_cast<char>(std::tolower(ch));
    else out += ' ';
  }
  return out;
}

std::string stem(const std::string& w) {
  if (w.size() > 5 && w.ends_with("ing")) return w.substr(0, w.size() - 3);
  if (w.size() > 3 && w.ends_with("s") && !w.ends_with("ss")) return w.substr(0, w.size() - 1);
  return w;
}

std::vector<std::string> tokens(const std::string& text) {
  std::vector<std::string> out;
  std::istringstream in(foldAscii(text));
  for (std::string w; in >> w;) out.push_back(stem(w));
  return out;
}

std::vector<std::string> key(const std::string& text) {
  std::vector<std::string> out;
  for (const auto& w : tokens(text)) {
    if (!kGeneric.count(w)) out.push_back(w);
  }
  return out;
}

bool subset(const std::vector<std::string>& k, const std::set<std::string>& words) {
  return std::all_of(k.begin(), k.end(), [&](const std::string& w) { return words.count(w) > 0; });
}

bool contiguous(const std::vector<std::string>& seq, const std::vector<std::string>& words) {
  if (seq.empty() || seq.size() > words.size()) return false;
  for (std::size_t i = 0; i + seq.size() <= words.size(); ++i) {
    if (std::equal(seq.begin(), seq.end(), words.begin() + static_cast<std::ptrdiff_t>(i))) return true;
  }
  return false;
}

std::string underscoresToSpaces(std::string s) {
  std::replace(s.begin(), s.end(), '_', ' ');
  return s;
}

// The alternatives in one schedule line: split on ",", ";" and the word "or".
std::vector<std::string> splitAlternatives(const std::string& text) {
  std::vector<std::string> parts;
  std::string cur;
  auto flush = [&] {
    if (cur.find_first_not_of(" \t") != std::string::npos) parts.push_back(cur);
    cur.clear();
  };
  for (std::size_t i = 0; i < text.size(); ++i) {
    const char ch = text[i];
    if (ch == ',' || ch == ';') {
      flush();
      continue;
    }
    const bool wordStart = i == 0 || !std::isalpha(static_cast<unsigned char>(text[i - 1]));
    const bool wordEnd = i + 2 >= text.size() || !std::isalpha(static_cast<unsigned char>(text[i + 2]));
    if (wordStart && wordEnd && i + 1 < text.size() && std::tolower(static_cast<unsigned char>(ch)) == 'o' &&
        std::tolower(static_cast<unsigned char>(text[i + 1])) == 'r') {
      flush();
      ++i;
      continue;
    }
    cur += ch;
  }
  flush();
  return parts;
}

using Match = std::pair<LocationId, std::string>;  // place ("home" for home), activity there or ""

struct Matcher {
  struct Keyed {
    LocationId place;
    std::string id;
    std::vector<std::string> key;
  };
  std::map<LocationId, std::vector<std::string>> nameKeys;
  std::map<LocationId, std::vector<std::string>> typeKeys;
  std::vector<Keyed> actKeys;
  std::vector<Keyed> offerKeys;

  explicit Matcher(const ContentDatabase& db) {
    for (const auto& [lid, loc] : db.locations()) {
      nameKeys[lid] = key(loc.name);
      typeKeys[lid] = key(underscoresToSpaces(loc.type));
      if (loc.access != AccessRule::Public) continue;
      for (const auto& a : loc.activities) {
        auto k = key(underscoresToSpaces(a.id));
        if (!k.empty() && a.id != "restroom") actKeys.push_back({lid, a.id, std::move(k)});
      }
      for (const auto& o : loc.offers) {
        auto k = key(underscoresToSpaces(o.id));
        if (!k.empty() && !o.illegal) offerKeys.push_back({lid, o.id, std::move(k)});
      }
    }
  }

  static bool isPublic(const ContentDatabase& db, const LocationId& lid) {
    const LocationDef* loc = db.location(lid);
    return loc && loc->access == AccessRule::Public;
  }

  // Best (place, activity) for one alternative of a schedule line.
  std::optional<Match> match(const ContentDatabase& db, const std::string& text, const LocationId& home,
                             const std::vector<LocationId>& workplaces) const {
    std::vector<std::string> words;
    for (const auto& w : tokens(text)) {
      auto syn = kSynonyms.find(w);
      words.push_back(syn == kSynonyms.end() ? w : syn->second);
    }
    const std::set<std::string> wordset(words.begin(), words.end());
    if (wordset.count("home")) return Match{"home", ""};
    std::map<LocationId, std::pair<int, std::string>> scores;
    auto offer = [&](const LocationId& lid, int score, const std::string& activity) {
      auto it = scores.find(lid);
      if (it == scores.end() || score > it->second.first) {
        const std::string act = !activity.empty() ? activity : (it != scores.end() ? it->second.second : "");
        scores[lid] = {score, act};
      } else if (!activity.empty() && it->second.second.empty()) {
        it->second.second = activity;
      }
    };
    for (const auto& [lid, k] : nameKeys) {
      if (k.empty()) continue;
      if (subset(k, wordset)) {
        offer(lid, 10 + static_cast<int>(k.size()), "");
        continue;
      }
      for (std::size_t n = k.size() - 1; n > 1; --n) {  // "Common Ground" names "Common Ground Community Center"
        if (contiguous(std::vector<std::string>(k.begin(), k.begin() + static_cast<std::ptrdiff_t>(n)), words)) {
          offer(lid, static_cast<int>(n), "");
          break;
        }
      }
    }
    for (const auto& a : actKeys) {
      if (subset(a.key, wordset)) offer(a.place, 5 + static_cast<int>(a.key.size()), a.id);
    }
    for (const auto& o : offerKeys) {
      if (subset(o.key, wordset)) offer(o.place, 5 + static_cast<int>(o.key.size()), "");
    }
    for (const auto& [lid, k] : typeKeys) {
      if (!k.empty() && isPublic(db, lid) && subset(k, wordset)) offer(lid, 3, "");
    }
    // Only places this character may walk into: public ones, their workplace, their home.
    auto isWorkplace = [&](const LocationId& lid) {
      return std::find(workplaces.begin(), workplaces.end(), lid) != workplaces.end();
    };
    std::optional<Match> best;
    std::tuple<int, bool, bool, bool, std::string> bestRank;
    for (const auto& [lid, sa] : scores) {
      if (!isPublic(db, lid) && !isWorkplace(lid) && lid != home) continue;
      std::tuple<int, bool, bool, bool, std::string> rank{sa.first, isWorkplace(lid), lid == home, isPublic(db, lid),
                                                          lid};
      if (!best || rank > bestRank) {
        best = Match{lid, sa.second};
        bestRank = rank;
      }
    }
    if (!best || std::get<0>(bestRank) < 2) return std::nullopt;
    if (best->second.empty()) {  // a named place may also name what to do there ("Greater Hope service")
      for (const auto& a : actKeys) {
        if (a.place == best->first && subset(a.key, wordset)) best->second = a.id;
      }
    }
    return best;
  }

  std::vector<Match> alternatives(const ContentDatabase& db, const std::string& text, const LocationId& home,
                                  const std::vector<LocationId>& workplaces) const {
    std::vector<Match> out;
    for (const auto& part : splitAlternatives(text)) {
      auto m = match(db, part, home, workplaces);
      if (m && std::find(out.begin(), out.end(), *m) == out.end()) out.push_back(*m);
    }
    return out;
  }
};

// The schedule lines for a weekday, as text (core/Schedule.h reads them the same way for the away routine).
std::vector<std::pair<int, std::string>> scheduleEntries(const Json& schedule, int weekday) {
  std::vector<std::pair<int, std::string>> out;
  for (const auto& [minute, e] : schedule::entriesFor(schedule, weekday))
    out.emplace_back(minute, e.value("activity", std::string()));
  return out;
}

// --- Content helpers (the same reading of data/ the director does) ------------------------------
bool openAt(const OpeningHours& h, GameMinutes minute) {
  const DateTime d = toDateTime(minute);
  return h.isOpenOn(d.weekday, d.hour);
}

bool isOpen(const LocationDef& loc, GameMinutes minute) { return !loc.hours || openAt(*loc.hours, minute); }

// Minutes until the place opens, if within `window`; 0 if open now; -1 otherwise.
int opensWithin(const LocationDef& loc, GameMinutes minute, int window) {
  for (int m = 0; m <= window; m += 5) {
    if (isOpen(loc, minute + m)) return m;
  }
  return -1;
}

bool lineOpen(const TransitLine& line, GameMinutes minute) {
  return OpeningHours{line.firstHour, line.lastHour, {}}.isOpenAt(toDateTime(minute).hour);
}

// Offers anyone might buy on an ordinary day: food, drink, a small treat. Not items, services, alcohol or
// anything illegal, and nothing dear.
std::vector<const Offer*> everydayOffers(const LocationDef& loc) {
  std::vector<const Offer*> out;
  for (const auto& o : loc.offers) {
    if (o.illegal || !o.service.empty() || !o.item.empty() || !o.substance.empty()) continue;
    if (o.priceCents > kEverydayMaxCents) continue;
    if (std::any_of(o.needEffects.begin(), o.needEffects.end(), [](const auto& kv) { return kv.second > 0; }))
      out.push_back(&o);
  }
  return out;
}

// The activity at this place that helps `need` most, or "".
std::string activityFor(const LocationDef& loc, const std::string& need) {
  std::string best;
  double gain = 0;
  for (const auto& a : loc.activities) {
    auto it = a.needEffects.find(need);
    if (it != a.needEffects.end() && it->second > gain) {
      best = a.id;
      gain = it->second;
    }
  }
  return best;
}

double needOf(const Json& needs, const std::string& need) {
  return needs.is_object() && needs.contains(need) && needs[need].is_number() ? needs[need].get<double>() : 100.0;
}

Vec2 positionOf(const Json& you) {
  const auto it = you.find("position");
  if (it == you.end() || !it->is_array() || it->size() < 2) return {};
  return {(*it)[0].get<double>(), (*it)[1].get<double>()};
}

struct Route {
  bool bus = false;
  double seconds = 0;
  const TransitLine* line = nullptr;
  const TransitStop* from = nullptr;
  const TransitStop* to = nullptr;
};

}  // namespace

// --- One character -------------------------------------------------------------------------------
struct Autopilot::Impl {
  struct Context {
    bool known = false;
    LocationId home;
    std::vector<LocationId> workplaces;
    double maxShiftHours = 8;
    std::set<LocationId> underConstruction;
    bool statusKnown = false;
    const PatrolDef* patrol = nullptr;           // the beat their career walks on shift (D-073), if any
    bool worksOutdoors = false;                  // their shift carries on outside the workplace
    std::map<CharacterId, double> friendship;    // their own friendship toward each contact (the contacts app)
    std::vector<CharacterId> partners;           // dating, engaged or married (the romance app)
    bool isWorkplace(const LocationId& lid) const {
      return std::find(workplaces.begin(), workplaces.end(), lid) != workplaces.end();
    }
  };

  // A round of the beat (D-073): out of the base, past `left` more places, back.
  struct PatrolState {
    bool active = false;
    int stop = 0;                  // index into the beat
    int left = 0;                  // places still to walk past this round
    GameMinutes lingerUntil = -1;  // at the current place until then
    GameMinutes lastEnd = -1;      // when the last round ended, or the shift started
    int round = 0;
    bool coffee = false;           // went in for a coffee at this place
  };

  struct Bot {
    CharacterId id;
    std::string first;
    bool playing = false;  // connected by the autopilot
    std::int64_t sleptOn = -1;  // the day this character went to bed
    std::int64_t ctxDay = -1;
    Context ctx;
    DayPlan plan;
    double nextActAt = 0;      // autopilot clock, real seconds
    double playWaitUntil = 0;
    double heldUntil = 0;      // in a cell: no commands until then
    double noBusUntil = 0;
    std::map<std::string, int> refusals;      // "action|target" -> refusals in a row
    std::map<std::string, double> cooldown;   // "action|target" -> clock before which not to retry
    std::map<std::string, std::set<std::string>> done;  // goal ident -> what has been done on that visit
    std::optional<std::pair<std::string, Goal>> errand;  // (need, where it's being dealt with)
    LocationId heading;        // where the current walk or ride is going
    bool riding = false;
    std::set<std::string> routineDone;  // "<day>/morning", "<day>/bed"
    int committedIndex = -1;   // the next block we already left for
    std::int64_t committedSleepDay = -1;
    std::int64_t boughtOn = -1;  // the day of the one everyday purchase
    std::vector<Json> pendingAsks;
    std::map<CharacterId, std::int64_t> greeted;     // person -> the game day they were last greeted
    std::map<CharacterId, std::int64_t> chatRolled;  // person -> the game day a chat with them was last considered
    std::map<std::string, int> stats;
    PatrolState patrol;
    std::string tonight;  // today's evening out (an evening plan id), or ""
    std::string lastOnce;
    std::set<std::string> unmatchedLogged;
    bool finished = false;
  };

  std::map<CharacterId, Bot> bots;
  double clock = 0;
  std::function<void(const std::string&)> logSink;
  std::unique_ptr<Matcher> matcher;
  const ContentDatabase* matcherFor = nullptr;

  // ------------------------------------------------------------------ helpers
  const Matcher& matcherOf(const World& w) {
    if (!matcher || matcherFor != &w.content()) {
      matcher = std::make_unique<Matcher>(w.content());
      matcherFor = &w.content();
    }
    return *matcher;
  }

  static double jittered(World& w, double seconds) { return seconds * (0.7 + 0.6 * w.roll()); }
  // A random index below n (n > 0), from the world's stream.
  static std::size_t pick(World& w, std::size_t n) {
    return std::min(n - 1, static_cast<std::size_t>(w.roll() * static_cast<double>(n)));
  }

  static std::string nameOf(const World& w, const LocationId& lid) {
    const LocationDef* loc = w.content().location(lid);
    return loc ? loc->name : (lid.empty() ? "?" : lid);
  }

  std::string stamp(const World& w) const {
    const DateTime d = toDateTime(w.now());
    return std::string(weekdayName(d.weekday)).substr(0, 3) + " " + hhmm(d.hour * 60 + d.minute);
  }

  void log(const World& w, const Bot& b, const char* action, const std::string& text) const {
    if (!logSink) return;
    auto padded = [](std::string s, std::size_t width) {
      if (s.size() < width) s.append(width - s.size(), ' ');
      return s;
    };
    logSink("autopilot [" + stamp(w) + "] " + padded(b.id, 10) + " " + padded(action, 9) + " " + text);
  }

  void logOnce(const World& w, Bot& b, const std::string& k, const char* action, const std::string& text) {
    if (b.lastOnce == k) return;
    b.lastOnce = k;
    log(w, b, action, text);
  }

  void pause(Bot& b, double seconds) { b.nextActAt = clock + std::max(kCommandIntervalSeconds, seconds); }

  static std::string ckey(const std::string& action, const std::string& target) { return action + "|" + target; }

  bool cooling(const Bot& b, const std::string& action, const std::string& target) const {
    auto it = b.cooldown.find(ckey(action, target));
    return it != b.cooldown.end() && it->second > clock;
  }

  // True (after a short wait) if this action is still backing off from a refusal.
  bool waiting(Bot& b, const std::string& action, const std::string& target) {
    auto it = b.cooldown.find(ckey(action, target));
    if (it == b.cooldown.end() || it->second <= clock) return false;
    pause(b, std::min(it->second - clock, 10.0));
    return true;
  }

  // Logs a refusal and backs off: base, 2x, 4x ... (with jitter) for this (action, target). A cell is
  // different: nothing works until it opens, so the character just waits and re-plans when free.
  void refused(World& w, Bot& b, const std::string& action, const std::string& target, const Error& err,
               double base = 3.0, double cap = 120.0) {
    ++b.stats["refusals"];
    if (err.code == "in_jail") {
      b.heldUntil = clock + jittered(w, kHeldSeconds);
      b.committedIndex = -1;
      b.committedSleepDay = -1;
      b.errand.reset();
      b.heading.clear();
      logOnce(w, b, "jail|" + std::to_string(b.plan.day), "held", err.message + "; waits to be let out");
      pause(b, b.heldUntil - clock);
      return;
    }
    const std::string k = ckey(action, target);
    const int n = ++b.refusals[k];
    const double wait = jittered(w, std::min(cap, base * std::pow(2.0, n - 1)));
    b.cooldown[k] = clock + wait;
    log(w, b, "refused", action + " " + target + ": " + err.code + " (" + err.message + "); not again for " +
                             std::to_string(static_cast<int>(wait)) + " s");
    pause(b, std::min(wait, 5.0));
  }

  void succeeded(Bot& b, const std::string& action, const std::string& target) {
    b.refusals.erase(ckey(action, target));
    b.cooldown.erase(ckey(action, target));
  }

  // ------------------------------------------------------------------ the day
  Route travel(const World& w, const Bot& b, Vec2 pos, Vec2 dest, GameMinutes minute) const {
    const double ws = w.content().sim().walkSpeedMetersPerSecond;
    Route best;
    best.seconds = distance(pos, dest) / ws;
    if (clock < b.noBusUntil || distance(pos, dest) < kBusMinDistanceMeters) return best;
    for (const auto& line : w.content().transit().lines) {
      if (line.stops.size() < 2 || !lineOpen(line, minute)) continue;
      const TransitStop* s1 = nullptr;
      const TransitStop* s2 = nullptr;
      for (const auto& st : line.stops) {
        if (!s1 || distance(pos, st.at) < distance(pos, s1->at)) s1 = &st;
        if (!s2 || distance(dest, st.at) < distance(dest, s2->at)) s2 = &st;
      }
      if (s1->id == s2->id) continue;
      const double t = distance(pos, s1->at) / ws + distance(s1->at, s2->at) / line.speedMps +
                       distance(s2->at, dest) / ws + 3;
      if (t + kBusMinSavingSeconds < best.seconds) best = Route{true, t, &line, s1, s2};
    }
    return best;
  }

  double etaMinutes(const World& w, const Bot& b, Vec2 pos, const LocationId& place, GameMinutes minute) const {
    const LocationDef* loc = w.content().location(place);
    if (!loc) return 0;
    return travel(w, b, pos, loc->door, minute).seconds * w.content().sim().minutesPerRealSecond;
  }

  std::string describe(const World& w, const DayPlan& plan) const {
    std::string out = "wake " + hhmm(plan.wake) + ", bed " + hhmm(plan.bed) + ": ";
    bool first = true;
    for (const auto& b : plan.blocks) {
      if (!first) out += "; ";
      first = false;
      out += hhmm(b.start) + "-" + hhmm(b.end) + " ";
      if (b.kind == Kind::Home) out += "home";
      else out += std::string(b.kind == Kind::Work ? "work at " : "") + nameOf(w, b.place);
      if (!b.activity.empty()) out += " (" + b.activity + ")";
      if (b.habit) out += " [autopilot habit]";
      if (b.evening) out += " [evening out: " + b.why + "]";
    }
    return out;
  }

  // One day's blocks from the schedule.
  DayPlan buildPlan(World& w, Bot& b, std::int64_t day, int weekday) {
    const ContentDatabase& db = w.content();
    const Matcher& m = matcherOf(w);
    const CharacterDef* def = w.definition(b.id);
    const Json schedule =
        def && def->profile.is_object() ? def->profile.value("schedule", Json::object()) : Json::object();
    const auto entries = scheduleEntries(schedule, weekday);
    const LocationId& home = b.ctx.home;
    const std::optional<int> first = entries.empty() ? std::nullopt : std::optional<int>(entries.front().first);
    const std::optional<int> last = entries.empty() ? std::nullopt : std::optional<int>(entries.back().first);
    int wake = std::min(std::max(first ? *first - kWakeBeforeFirst : 8 * 60 + 30, kWakeEarliest), kWakeLatest);
    if (first && *first < wake) wake = std::max(*first - 30, 5 * 60);
    const int bed = std::min(std::max(last ? *last + kBedAfterLast : 23 * 60, kBedEarliest), kBedLatest);
    DayPlan plan;
    plan.day = day;
    plan.weekday = weekday;
    plan.wake = wake;
    plan.bed = bed;
    auto& blocks = plan.blocks;
    auto add = [&](Kind kind, int start, int end, const LocationId& place, const std::string& activity,
                   const std::string& why, bool habit = false) {
      start = std::max(start, wake);
      end = std::min(end, bed);
      if (end <= start) return;
      if (!blocks.empty() && blocks.back().kind == Kind::Home && kind == Kind::Home) {
        blocks.back().end = end;
        return;
      }
      Goal g;
      g.kind = kind;
      g.place = kind == Kind::Home ? home : place;
      g.activity = activity;
      g.why = why;
      g.start = start;
      g.end = end;
      g.index = static_cast<int>(blocks.size());
      g.habit = habit;
      blocks.push_back(std::move(g));
    };
    add(Kind::Home, wake, first ? *first : bed, "", "", "morning at home");
    bool worked = false;
    for (std::size_t i = 0; i < entries.size(); ++i) {
      const auto& [t, text] = entries[i];
      const int end = i + 1 < entries.size() ? entries[i + 1].first : bed;
      std::vector<Match> alts;
      for (const auto& a : m.alternatives(db, text, home, b.ctx.workplaces)) {
        if (!b.ctx.underConstruction.count(a.first)) alts.push_back(a);
      }
      std::optional<Match> choice;
      if (!alts.empty()) choice = alts[pick(w, alts.size())];
      if (choice && b.ctx.isWorkplace(choice->first) && !worked) {
        const int wend = std::min(end, t + static_cast<int>(b.ctx.maxShiftHours * 60));
        add(Kind::Work, t, wend, choice->first, "", text);
        add(Kind::Home, wend, end, "", "", "after work");
        worked = true;
      } else if (choice && choice->first != "home" && choice->first != home) {  // a visit (a workplace after work too)
        int vend = std::min(end, t + kVisitMax);
        const LocationDef* loc = db.location(choice->first);
        if (loc && loc->hours && loc->hours->openHour < loc->hours->closeHour && t < loc->hours->closeHour * 60)
          vend = std::min(vend, loc->hours->closeHour * 60);  // leave by closing time
        add(Kind::Place, t, vend, choice->first, choice->second, text);
        add(Kind::Home, vend, end, "", "", "home again");
      } else {
        if (!choice && b.unmatchedLogged.insert(text).second)
          log(w, b, "routine", "'" + text + "' names no place in the town; time at home instead");
        add(Kind::Home, t, end, "", "", text);
      }
    }
    auto workIt = std::find_if(blocks.begin(), blocks.end(), [](const Goal& g) { return g.kind == Kind::Work; });
    // Autopilot habit: a coffee before some work days, when a coffee shop is open and on the way.
    if (workIt != blocks.end() && w.roll() < 0.4) {
      const std::size_t wi = static_cast<std::size_t>(workIt - blocks.begin());
      const LocationDef* workLoc = db.location(workIt->place);
      const LocationDef* cafe = nullptr;
      for (const auto& [lid, loc] : db.locations()) {
        if (loc.type != "coffee_shop" || loc.access != AccessRule::Public || !workLoc) continue;
        if (!cafe || distance(loc.door, workLoc->door) < distance(cafe->door, workLoc->door)) cafe = &loc;
      }
      const LocationDef* homeLoc = db.location(home);
      if (cafe && workLoc && homeLoc && wi > 0 && blocks[wi - 1].kind == Kind::Home) {
        Goal& before = blocks[wi - 1];
        const double detour = distance(homeLoc->door, cafe->door) + distance(cafe->door, workLoc->door) -
                              distance(homeLoc->door, workLoc->door);
        const double toWorkSeconds = distance(cafe->door, workLoc->door) / db.sim().walkSpeedMetersPerSecond;
        const int toWork = static_cast<int>(std::ceil(toWorkSeconds * db.sim().minutesPerRealSecond));
        const int start = workIt->start - 30 - toWork;
        if (detour <= 150 && start >= before.start + 20 && isOpen(*cafe, day * kMinutesPerDay + start)) {
          before.end = start;
          Goal g;
          g.kind = Kind::Place;
          g.place = cafe->id;
          g.why = "coffee before work";
          g.start = start;
          g.end = workIt->start;
          g.habit = true;
          blocks.insert(blocks.begin() + static_cast<std::ptrdiff_t>(wi), std::move(g));
        }
      }
    }
    // Autopilot habit: an outing on a day with nothing scheduled.
    if (entries.empty()) {
      std::vector<const LocationDef*> spots;
      for (const auto& [lid, loc] : db.locations()) {
        if (loc.access != AccessRule::Public || b.ctx.underConstruction.count(lid)) continue;
        if (!loc.constructionProject.empty() && !b.ctx.statusKnown) continue;
        if (loc.hours && loc.hours->openHour >= 20) continue;  // night spots aren't an afternoon outing
        if (loc.enterable) {
          if (!everydayOffers(loc).empty()) spots.push_back(&loc);
        } else if (std::any_of(loc.activities.begin(), loc.activities.end(),
                               [](const Activity& a) { return a.id != "restroom"; })) {
          spots.push_back(&loc);
        }
      }
      if (!spots.empty()) {
        const LocationDef* spot = spots[pick(w, spots.size())];
        const int starts[3] = {11 * 60, 14 * 60, 16 * 60};
        const int start = starts[std::min<std::size_t>(2, static_cast<std::size_t>(w.roll() * 3))];
        if (isOpen(*spot, day * kMinutesPerDay + start) && !blocks.empty() && blocks[0].kind == Kind::Home) {
          const int tail = blocks[0].end;
          blocks[0].end = start;
          std::string act;
          if (!spot->enterable) {
            for (const auto& a : spot->activities) {
              if (a.id != "restroom") {
                act = a.id;
                break;
              }
            }
          }
          Goal g;
          g.kind = Kind::Place;
          g.place = spot->id;
          g.activity = act;
          g.why = "an outing";
          g.start = start;
          g.end = start + 90;
          g.habit = true;
          blocks.push_back(std::move(g));
          Goal h;
          h.kind = Kind::Home;
          h.place = home;
          h.why = "home again";
          h.start = start + 90;
          h.end = tail;
          blocks.push_back(std::move(h));
        }
      }
    }
    for (std::size_t i = 0; i < blocks.size(); ++i) blocks[i].index = static_cast<int>(i);
    b.tonight.clear();
    addEvening(w, b, plan);
    for (std::size_t i = 0; i < blocks.size(); ++i) blocks[i].index = static_cast<int>(i);
    return plan;
  }

  // ------------------------------------------------------------------ evenings out (D-073)
  // A number in [0, 1) from a hash: the same all day, after a restart, and for both of a pair.
  static double unitDraw(const std::string& who, std::int64_t day, const std::string& what) {
    return static_cast<double>(dayhash::dayKey(who, day, what) >> 11) * (1.0 / 9007199254740992.0);
  }

  static bool suits(const CharacterDef& def, const EveningPlanDef& e) {
    for (const auto& [trait, min] : e.personalityMin) {
      const auto it = def.personality.find(trait);
      if (it == def.personality.end() || it->second < min) return false;
    }
    for (const auto& [value, min] : e.valuesMin) {
      const auto it = def.values.find(value);
      if (it == def.values.end() || it->second < min) return false;
    }
    if (e.interestsAny.empty()) return true;
    return std::any_of(e.interestsAny.begin(), e.interestsAny.end(), [&](const std::string& i) {
      return std::find(def.interests.begin(), def.interests.end(), i) != def.interests.end();
    });
  }

  // Who they'd go with, if anyone: for a pair, the first (by id) whose pair draw comes up; "" alone. False if the plan
  // doesn't happen for them today.
  bool drawEvening(const Bot& b, const EveningPlanDef& e, std::int64_t day, CharacterId& with) const {
    with.clear();
    const std::string what = "evening:" + e.id;
    if (e.with.empty()) return unitDraw(b.id, day, what) < e.chance;
    std::vector<CharacterId> candidates;
    if (e.with == "partner") {
      candidates = b.ctx.partners;
    } else {
      for (const auto& [other, f] : b.ctx.friendship) {
        if (f >= e.minFriendship) candidates.push_back(other);
      }
    }
    std::sort(candidates.begin(), candidates.end());
    for (const auto& other : candidates) {
      const std::string pair = std::min(b.id, other) + "+" + std::max(b.id, other);
      if (unitDraw(pair, day, what) < e.chance) {
        with = other;
        return true;
      }
    }
    return false;
  }

  // The first evening plan for today that suits them, fits a free stretch at home from its start (their own schedule
  // always wins) and comes up in its draw. Bedtime moves later for it, never past the latest bedtime.
  void addEvening(const World& w, Bot& b, DayPlan& plan) {
    const ContentDatabase& db = w.content();
    const CharacterDef* def = w.definition(b.id);
    if (!def) return;
    auto& blocks = plan.blocks;
    for (const auto& e : db.townLife().evenings) {
      if (std::find(e.days.begin(), e.days.end(), plan.weekday) == e.days.end() || !suits(*def, e)) continue;
      const LocationDef* loc = db.location(e.place);
      if (!loc || b.ctx.underConstruction.count(e.place)) continue;
      if (!loc->constructionProject.empty() && !b.ctx.statusKnown) continue;
      if (!isOpen(*loc, plan.day * kMinutesPerDay + e.from)) continue;
      int end = e.from + e.minutes;
      if (loc->hours && loc->hours->openHour < loc->hours->closeHour) end = std::min(end, loc->hours->closeHour * 60);
      const int bed = std::max(plan.bed, std::min(kBedLatest, end + 30));
      const auto at = std::find_if(blocks.begin(), blocks.end(), [&](const Goal& g) {
        const int blockEnd = &g == &blocks.back() && g.end == plan.bed ? bed : g.end;
        return g.kind == Kind::Home && !g.habit && g.start <= e.from && blockEnd >= std::min(end, e.from + 45);
      });
      if (at == blocks.end()) continue;
      CharacterId with;
      if (!drawEvening(b, e, plan.day, with)) continue;
      // Taken: split the stretch at home around it.
      const bool last = at + 1 == blocks.end();
      if (last && at->end == plan.bed) {
        plan.bed = bed;
        at->end = bed;
      }
      end = std::min(end, at->end);
      Goal before = *at, out, after = *at;
      before.end = e.from;
      out.kind = Kind::Place;
      out.place = e.place;
      out.activity = e.activity;
      out.offer = e.offer;
      out.evening = true;
      const CharacterDef* other = with.empty() ? nullptr : w.definition(with);
      out.why = e.label + (other ? " with " + other->firstName : "");
      out.start = e.from;
      out.end = end;
      after.start = end;
      std::vector<Goal> parts;
      if (before.end > before.start) parts.push_back(before);
      parts.push_back(out);
      if (after.end > after.start) parts.push_back(after);
      const auto pos = blocks.erase(at);
      blocks.insert(pos, parts.begin(), parts.end());
      b.tonight = e.id;
      return;
    }
  }

  // Real seconds for this many game minutes at the world's clock rate.
  static double realSeconds(const World& w, double gameMinutes) {
    return gameMinutes / std::max(w.content().sim().minutesPerRealSecond, 0.01);
  }

  void defaultContext(const World& w, Bot& b) {
    const CharacterDef* def = w.definition(b.id);
    b.ctx = Context{};
    b.ctx.known = true;
    if (!def) return;
    b.ctx.home = def->spawnLocation;
    if (const CareerDef* career = w.content().career(def->careerId)) {
      b.ctx.workplaces = career->workplaces;
      b.ctx.maxShiftHours = career->maxShiftHours;
      b.ctx.worksOutdoors = career->worksOutdoors;
      b.ctx.patrol = w.content().patrolFor(career->id);
    }
  }

  // Where this character lives and works now (people move house and change jobs) and which places are still
  // being built: the property and career phone apps and the map, once a game day.
  void discover(World& w, Bot& b, std::int64_t day) {
    const ContentDatabase& db = w.content();
    b.ctxDay = day;
    const CharacterDef* def = w.definition(b.id);
    LocationId home = def ? def->spawnLocation : LocationId();
    if (auto prop = w.openPhoneApp(b.id, "property")) {
      for (const auto& p : prop.value().value("properties", Json::array())) {
        if (p.value("lives_here", false) && db.location(p.value("location", std::string())))
          home = p["location"].get<std::string>();
      }
    }
    std::string careerId = def ? def->careerId : std::string();
    std::vector<LocationId> workplaces;
    if (const CareerDef* career = db.career(careerId)) workplaces = career->workplaces;
    if (auto car = w.openPhoneApp(b.id, "career")) {
      const Json& c = car.value();
      if (c.value("career", Json()).is_null()) {
        workplaces.clear();
        careerId.clear();
      } else {
        std::vector<LocationId> found;
        for (const auto& name : c.value("workplaces", Json::array())) {
          for (const auto& [lid, loc] : db.locations()) {
            if (name.is_string() && loc.name == name.get<std::string>()) found.push_back(lid);
          }
        }
        if (!found.empty()) workplaces = found;
        for (const auto& [cid, cdef] : db.careers()) {
          if (cdef.name == c.value("career", std::string())) careerId = cid;
        }
      }
    }
    const CareerDef* career = db.career(careerId);
    const double maxH = career ? career->maxShiftHours : 8.0;
    std::set<LocationId> building;
    for (const auto& [lid, loc] : db.locations()) {
      if (w.locationStatus(loc) == "under_construction") building.insert(lid);  // what `map` shows
    }
    // Who they'd spend an evening with (D-073): their own side only, as their phone shows it.
    std::map<CharacterId, double> friendship;
    if (auto contacts = w.openPhoneApp(b.id, "contacts")) {
      for (const auto& c : contacts.value().value("contacts", Json::array())) {
        const Json feelings = c.value("your_feelings", Json::object());
        friendship[c.value("id", std::string())] = feelings.value("friendship", 0.0);
      }
    }
    std::vector<CharacterId> partners;
    if (auto romance = w.openPhoneApp(b.id, "romance")) {
      for (const auto& r : romance.value().value("relationships", Json::array())) {
        const std::string status = r.value("status", std::string());
        if (status == "dating" || status == "engaged" || status == "married") partners.push_back(r.value("id", ""));
      }
    }
    const Context old = b.ctx;
    b.ctx.known = true;
    b.ctx.home = home;
    b.ctx.workplaces = workplaces;
    b.ctx.maxShiftHours = maxH;
    b.ctx.underConstruction = building;
    b.ctx.statusKnown = true;
    b.ctx.worksOutdoors = career && career->worksOutdoors;
    b.ctx.patrol = career ? db.patrolFor(career->id) : nullptr;
    b.ctx.friendship = friendship;
    b.ctx.partners = partners;
    if (!old.known || !old.statusKnown) {
      b.plan = DayPlan{};  // now we know which places are still being built
    } else if (old.home != home || old.workplaces != workplaces || old.maxShiftHours != maxH) {
      b.plan = DayPlan{};  // rebuilt from the new home or job
      std::string at;
      for (const auto& wp : workplaces) at += (at.empty() ? "" : ", ") + nameOf(w, wp);
      log(w, b, "routine", "lives at " + nameOf(w, home) + ", works at " + (at.empty() ? "nowhere" : at));
    }
  }

  DayPlan& planFor(World& w, Bot& b, std::int64_t day, int weekday) {
    if (!b.ctx.known) defaultContext(w, b);
    if (b.plan.day != day) {
      b.plan = buildPlan(w, b, day, weekday);
      b.done.clear();
      b.committedIndex = -1;
      b.committedSleepDay = -1;
    }
    return b.plan;
  }

  // ------------------------------------------------------------------ out of the world
  void offstage(World& w, Bot& b) {
    const GameMinutes now = w.now();
    const DateTime d = toDateTime(now);
    const int mod = static_cast<int>(now % kMinutesPerDay);
    const DayPlan& plan = planFor(w, b, d.dayIndex, d.weekday);
    if (!plan.awake(mod) || b.sleptOn == d.dayIndex) {
      const bool later = mod >= plan.wake || b.sleptOn == d.dayIndex;
      logOnce(w, b, "asleep|" + std::to_string(d.dayIndex) + (later ? "|later" : ""), "asleep",
              std::string("out of the world until ") + (later ? "tomorrow morning" : hhmm(plan.wake)));
      pause(b, jittered(w, 20));
      return;
    }
    if (clock < b.playWaitUntil) {
      pause(b, std::min(30.0, b.playWaitUntil - clock));
      return;
    }
    ++b.stats["commands"];
    if (Status st = w.connect(b.id); !st) {
      log(w, b, "stop", "can't enter the world: " + st.error().code + " (" + st.error().message + ")");
      if (st.error().code == "unknown_character") b.finished = true;
      else {
        b.playWaitUntil = clock + jittered(w, 60);
        pause(b, 30);
      }
      return;
    }
    w.setScripted(b.id, true, kLabel);
    b.playing = true;
    b.errand.reset();
    b.committedIndex = -1;
    b.committedSleepDay = -1;
    b.heading.clear();
    b.riding = false;
    ++b.stats["plays"];
    discover(w, b, d.dayIndex);
    const DayPlan& today = planFor(w, b, d.dayIndex, d.weekday);
    log(w, b, "play", "enters the world as " + b.first + ". Today: " + describe(w, today));
    pause(b, jittered(w, 1.5));
  }

  void goToBed(World& w, Bot& b, const DayPlan& plan, const std::string& where) {
    ++b.stats["commands"];
    w.disconnect(b.id);  // ends a shift itself; offline life looks after the night (D-050)
    b.playing = false;
    b.errand.reset();
    b.committedIndex = -1;
    b.committedSleepDay = -1;
    b.heading.clear();
    b.riding = false;
    // Home after midnight, before this day's wake time: it's last night's bed, and today still starts at its wake time
    // (marking today slept through would keep them out of the world until tomorrow).
    const bool pastMidnight = static_cast<int>(w.now() % kMinutesPerDay) < plan.wake;
    b.sleptOn = pastMidnight ? plan.day - 1 : plan.day;
    ++b.stats["nights"];
    log(w, b, "bed", "goes to bed (" + where + "): leaves the world until " + hhmm(plan.wake) +
                         (pastMidnight ? " today" : " tomorrow"));
    pause(b, jittered(w, 20));
  }

  // ------------------------------------------------------------------ in the world
  void play(World& w, Bot& b) {
    auto lookR = w.look(b.id);
    if (!lookR) {
      // Someone else took the character out of the world (a human's leave without release): back off,
      // then come back at the usual time.
      log(w, b, "left", "the world says we're not in it (" + lookR.error().code + ")");
      b.playing = false;
      b.playWaitUntil = clock + jittered(w, 10);
      pause(b, 5);
      return;
    }
    const Json& look = lookR.value();
    const GameMinutes now = w.now();
    const DateTime d = toDateTime(now);
    const std::int64_t day = d.dayIndex;
    const int mod = static_cast<int>(now % kMinutesPerDay);
    if (manners(w, b, look, day)) return;
    if (b.ctxDay != day) discover(w, b, day);
    DayPlan& plan = planFor(w, b, day, d.weekday);
    const Json& you = look["you"];
    const Vec2 pos = positionOf(you);
    const LocationId& home = b.ctx.home;
    const std::string inside = you.value("inside", std::string());
    const bool onShift = you.value("on_shift", false);
    Goal sleep;
    sleep.kind = Kind::Sleep;
    sleep.place = home;
    sleep.why = "bedtime";
    Goal goal;
    if (!plan.awake(mod)) {
      goal = sleep;
    } else {
      if (const Goal* cur = plan.current(mod)) goal = *cur;
      else {
        goal.kind = Kind::Home;
        goal.place = home;
        goal.why = "free time";
        goal.start = mod;
        goal.end = plan.bed;
      }
      if (plan.skipped.count(goal.index)) {
        Goal g;
        g.kind = Kind::Home;
        g.place = home;
        g.why = "skipped " + nameOf(w, goal.place);
        g.start = goal.start;
        g.end = goal.end;
        goal = g;
      }
      const bool routineFirst = goal.kind == Kind::Home && inside == home && mod < 12 * 60 &&
                                !b.routineDone.count(std::to_string(day) + "/morning");
      // Once on the way to the next thing, stay on the way: the travel estimate shrinks as we get closer, and
      // re-deciding from it would turn people around mid-trip.
      if (b.committedSleepDay == day) {
        goal = sleep;
      } else if (b.committedIndex >= 0 && b.committedIndex < static_cast<int>(plan.blocks.size()) &&
                 plan.blocks[static_cast<std::size_t>(b.committedIndex)].start > mod &&
                 !plan.skipped.count(b.committedIndex)) {
        goal = plan.blocks[static_cast<std::size_t>(b.committedIndex)];
      } else if (!(goal.kind == Kind::Work && onShift) && !routineFirst) {
        const Goal* nxt = nullptr;
        if (goal.index >= 0 && goal.index < static_cast<int>(plan.blocks.size()) - 1)
          nxt = &plan.blocks[static_cast<std::size_t>(goal.index) + 1];
        if (!nxt && goal.index < 0) {
          for (const auto& blk : plan.blocks) {
            if (blk.start > mod) {
              nxt = &blk;
              break;
            }
          }
        }
        if (nxt) {
          if (!plan.skipped.count(nxt->index) &&
              nxt->start - mod <= etaMinutes(w, b, pos, nxt->place, now) + kTravelSlack) {
            goal = *nxt;
            b.committedIndex = nxt->index;
          }
        } else if (plan.bed - mod <= etaMinutes(w, b, pos, home, now) + kTravelSlack) {
          goal = sleep;
          b.committedSleepDay = day;
        }
      }
    }
    if (goal.kind == Kind::Place && plan.has(goal) && !tooLateChecked(w, b, goal, you, pos, plan, now)) return;
    goal = urgent(w, b, look, goal, now);
    pursue(w, b, look, goal, plan, now);
  }

  // People it meets: a greeting once per person per game day (by name only if it knows them), and now and then a
  // chat with someone it knows. People only: never another autopilot founder or a script (`scripted` in look),
  // and only someone close enough to hear it. One command at most, like any turn; true if one went out.
  bool manners(World& w, Bot& b, const Json& look, std::int64_t day) {
    const AutopilotMannersConfig& M = w.content().autopilotManners();
    const std::string inside = look["you"].value("inside", std::string());
    const Json people = look.value("people", Json::array());
    for (const auto& p : people) {
      const CharacterId pid = p.value("id", std::string());
      if (pid.empty() || p.value("scripted", false)) continue;
      const bool sameRoom = !inside.empty() && p.value("inside", std::string()) == inside;
      const double apart = p.value("distance_m", 1e9);
      if (!sameRoom && (!inside.empty() || apart > M.greetRangeMeters)) continue;
      const bool known = p.value("known", false);
      const CharacterDef* them = w.definition(pid);
      const std::string first = them ? them->firstName : pid;
      auto greetedIt = b.greeted.find(pid);
      if (!M.greetKnown.empty() && (greetedIt == b.greeted.end() || greetedIt->second != day)) {
        b.greeted[pid] = day;
        const std::vector<std::string>& lines = known ? M.greetKnown : M.greetStranger;
        std::string line = lines[pick(w, lines.size())];
        for (auto at = line.find("{first}"); at != std::string::npos; at = line.find("{first}"))
          line.replace(at, 7, first);
        ++b.stats["commands"];
        auto r = w.say(b.id, line, "say");
        ++b.stats["greetings"];
        log(w, b, "greet", "says \"" + line + "\" to " + first + (r ? "" : "; the world said " + r.error().code));
        pause(b, jittered(w, 2.0));
        return true;
      }
      const InteractionDef* chat = w.content().interaction(M.chatInteraction);
      auto rolledIt = b.chatRolled.find(pid);
      if (!known || !chat || (rolledIt != b.chatRolled.end() && rolledIt->second == day)) continue;
      if (!sameRoom && apart > chat->rangeMeters) continue;
      b.chatRolled[pid] = day;  // considered once a day: lingering nearby doesn't make a chat certain
      const CharacterDef* me = w.definition(b.id);
      const auto trait = me ? me->personality.find(M.chatTrait) : StatMap::const_iterator();
      const double t = me && trait != me->personality.end() ? trait->second : 50;
      const double friendship = std::max(0.0, w.relationshipValue(b.id, pid, "friendship"));  // its own side
      const double chance =
          std::clamp(M.chatBase + M.chatPerTrait * t / 100 + M.chatPerFriendship * friendship / 100, 0.0, 1.0);
      if (w.roll() >= chance) continue;
      ++b.stats["commands"];
      auto r = w.interact(b.id, chat->id, pid);
      if (!r) {
        refused(w, b, "interact", pid, r.error(), 10, 300);
        return true;
      }
      ++b.stats["chats"];
      log(w, b, "chat",
          chat->label + " with " + first + " (someone it knows): " + r.value().value("reaction", std::string()));
      pause(b, jittered(w, 2.0));
      return true;
    }
    return false;
  }

  // Answers an ask by the data's rule for its kind, from its own side of the relationship with the asker; a kind
  // with no rule is declined, and intimacy always is.
  bool acceptsAsk(const World& w, const Bot& b, const std::string& kind, const CharacterId& from,
                  std::string& why) const {
    if (kind == "intimacy") {
      why = "the autopilot never accepts intimacy";
      return false;
    }
    const auto& rules = w.content().autopilotManners().asks;
    const auto rule =
        std::find_if(rules.begin(), rules.end(), [&](const AutopilotAskRule& r) { return r.kind == kind; });
    if (rule == rules.end()) {
      why = "the autopilot's data has no rule for a '" + kind + "' ask";
      return false;
    }
    for (const auto& [dim, min] : rule->min) {
      const double v = w.relationshipValue(b.id, from, dim);
      if (v < min) {
        why = dim + " " + std::to_string(static_cast<int>(std::floor(v))) + " is under " +
              std::to_string(static_cast<int>(min));
        return false;
      }
    }
    why = "their feelings meet the data's rule for a '" + kind + "'";
    return true;
  }

  // False (after skipping it) if a visit can't fit any more: we'd arrive with under 10 minutes before having to leave
  // for the next thing.
  bool tooLateChecked(World& w, Bot& b, const Goal& goal, const Json& you, Vec2 pos, DayPlan& plan, GameMinutes now) {
    const LocationDef* loc = w.content().location(goal.place);
    if (!loc || you.value("inside", std::string()) == goal.place) return true;
    const double here = loc->enterable ? w.content().sim().entryRadiusMeters : loc->outdoorRadius;
    if (distance(pos, loc->door) <= here) return true;  // already there
    const int mod = static_cast<int>(now % kMinutesPerDay);
    const double arrive = mod + etaMinutes(w, b, pos, goal.place, now);
    double leaveBy = goal.end;
    if (goal.index + 1 < static_cast<int>(plan.blocks.size())) {
      const Goal& nxt = plan.blocks[static_cast<std::size_t>(goal.index) + 1];
      if (!nxt.place.empty() && w.content().location(nxt.place))
        leaveBy -= etaMinutes(w, b, loc->door, nxt.place, now) + kTravelSlack;
    }
    if (arrive + 10 <= leaveBy) return true;
    skip(w, b, plan, goal, "no time left for it today (would arrive " + hhmm(static_cast<int>(arrive)) + ", leave by " +
                               hhmm(static_cast<int>(leaveBy)) + ")");
    if (b.committedIndex == goal.index) b.committedIndex = -1;
    return false;
  }

  // The bathroom, food or rest when a need gets low, before anything else (except bedtime).
  Goal urgent(World& w, Bot& b, const Json& look, const Goal& goal, GameMinutes now) {
    if (goal.kind == Kind::Sleep) return goal;
    const Json& you = look["you"];
    const Json needs = you.value("needs", Json::object());
    if (b.errand) {
      if (needOf(needs, b.errand->first) >= kNeedRecovered.at(b.errand->first)) b.errand.reset();
      else return b.errand->second;
    }
    const bool onShift = you.value("on_shift", false);
    for (const char* need : {"bladder", "hunger", "energy"}) {
      if (needOf(needs, need) >= kNeedUrgent.at(need) || cooling(b, "errand", need)) continue;
      if (std::string(need) == "bladder" && onShift) continue;  // people on shift can use the restroom at work
      if (std::string(need) == "hunger" && onShift && (now % kMinutesPerDay) < 11 * 60) continue;  // lunch, not earlier
      auto g = placeForNeed(w, b, need, positionOf(you), you.value("inside", std::string()), now);
      if (g) {
        b.errand = std::make_pair(std::string(need), *g);
        log(w, b, "needs", std::string(need) + " is down to " + std::to_string(static_cast<int>(needOf(needs, need))) +
                               ": " + g->why + ", so " + nameOf(w, g->place));
        return *g;
      }
    }
    return goal;
  }

  std::optional<Goal> placeForNeed(World& w, Bot& b, const std::string& need, Vec2 pos, const LocationId& here,
                                   GameMinutes now) {
    const LocationId& home = b.ctx.home;
    std::optional<Goal> best;
    double bestCost = 0;
    for (const auto& [lid, loc] : w.content().locations()) {
      if (lid != home && !b.ctx.isWorkplace(lid) && loc.access != AccessRule::Public) continue;
      if (b.ctx.underConstruction.count(lid) || cooling(b, "place", lid)) continue;
      const std::string act = activityFor(loc, need);
      bool food = false;
      if (need == "hunger") {
        for (const Offer* o : everydayOffers(loc)) {
          auto it = o->needEffects.find("hunger");
          if (it != o->needEffects.end() && it->second > 0) food = true;
        }
      }
      if (act.empty() && !food) continue;
      const double eta = lid == here ? 0 : etaMinutes(w, b, pos, lid, now);
      if (lid != home && !b.ctx.isWorkplace(lid) && !isOpen(loc, now + static_cast<GameMinutes>(eta))) continue;
      const double cost = eta + (lid == home ? 0 : 2);
      if (!best || cost < bestCost || (cost == bestCost && lid < best->place)) {
        Goal g;
        g.kind = lid != home ? Kind::Place : Kind::Home;
        g.place = lid;
        g.activity = act;
        g.why = need == "bladder" ? "needs the bathroom" : (need == "hunger" ? "hungry" : "exhausted");
        g.start = static_cast<int>(now % kMinutesPerDay);
        g.end = g.start + 90;
        g.errand = true;
        best = g;
        bestCost = cost;
      }
    }
    return best;
  }

  void pursue(World& w, Bot& b, const Json& look, const Goal& goal, DayPlan& plan, GameMinutes now) {
    const Json& you = look["you"];
    const std::string inside = you.value("inside", std::string());
    const Vec2 pos = positionOf(you);
    const LocationId target = goal.place.empty() ? b.ctx.home : goal.place;
    const bool onShift = you.value("on_shift", false);
    if (b.patrol.active) {
      if (goal.kind == Kind::Work && onShift) {
        walkBeat(w, b, look, now);
        return;
      }
      b.patrol.active = false;  // the shift is over (or the World ended it): the beat ends where they are
    }
    // A shift carries on through an errand at the workplace (lunch at the café you work in) and, for a job that works
    // outdoors, through any errand; anything else ends it.
    const bool keepsShift = goal.errand && (b.ctx.worksOutdoors || (inside == target && b.ctx.isWorkplace(target)));
    if (onShift && !(goal.kind == Kind::Work && (inside == target || b.ctx.worksOutdoors)) && !keepsShift) {
      endShift(w, b);
      return;
    }
    if (you.value("moving", false)) {
      if (b.riding || you.value("mode", std::string()) == "bus") {
        pause(b, 15);  // on the bus until the stop
        return;
      }
      if (b.heading == target) {
        pause(b, 10);
        return;
      }
    }
    if (inside == target) {
      atPlace(w, b, look, goal, plan, now);
      return;
    }
    const LocationDef* loc = w.content().location(target);
    if (!loc) {
      skip(w, b, plan, goal, "no such place");
      return;
    }
    // A visit that can't happen (a site, a place that won't open in time) is skipped before stepping out for it.
    if (goal.kind == Kind::Place && cantVisit(w, b, goal, *loc, pos, now, plan)) return;
    if (!inside.empty()) {
      leaveBuilding(w, b, "heading to " + nameOf(w, target));
      return;
    }
    if (loc->enterable) {
      if (distance(pos, loc->door) <= w.content().sim().entryRadiusMeters - 0.5) {
        enter(w, b, goal, plan, now);
        return;
      }
    } else if (distance(pos, loc->door) <= loc->outdoorRadius - 1) {
      atPlace(w, b, look, goal, plan, now);
      return;
    }
    go(w, b, goal, *loc, pos, now, plan);
  }

  // True (after skipping the visit) when there's no point going: the place is still being built, or it won't be
  // open on arrival nor within the wait the autopilot is prepared to spend at a door.
  bool cantVisit(World& w, Bot& b, const Goal& goal, const LocationDef& target, Vec2 pos, GameMinutes now,
                 DayPlan& plan) {
    if (b.ctx.underConstruction.count(target.id)) {
      skip(w, b, plan, goal, target.name + " is still being built");
      return true;
    }
    if (b.ctx.isWorkplace(target.id)) return false;
    const double eta = etaMinutes(w, b, pos, target.id, now);
    if (opensWithin(target, now + static_cast<GameMinutes>(eta), kWaitForOpening) < 0) {
      skip(w, b, plan, goal, target.name + " is closed then");
      return true;
    }
    return false;
  }

  void go(World& w, Bot& b, const Goal& goal, const LocationDef& target, Vec2 pos, GameMinutes now, DayPlan& plan) {
    if (goal.kind == Kind::Place && cantVisit(w, b, goal, target, pos, now, plan)) return;
    const Route route = travel(w, b, pos, target.door, now);
    if (route.bus) {
      if (distance(pos, route.from->at) <= w.content().transit().boardingRadiusMeters - 3) {
        ride(w, b, *route.line, *route.from, *route.to, target.id);
      } else {
        walkTo(w, b, pos, route.from->at, target.id,
               "the " + route.from->name + " stop (bus to " + route.to->name + ", for " + target.name + ")");
      }
      return;
    }
    walkTo(w, b, pos, target.door, target.id, target.name + (goal.why.empty() ? "" : " (" + goal.why + ")"));
  }

  void walkTo(World& w, Bot& b, Vec2 from, Vec2 dest, const LocationId& heading, const std::string& label) {
    if (waiting(b, "move", heading)) return;
    ++b.stats["commands"];
    if (Status st = w.moveTo(b.id, dest); !st) {
      if (st.error().code == "inside_building") {
        pause(b, 2);  // the next look shows the building; we leave it first
        return;
      }
      refused(w, b, "move", heading, st.error());
      return;
    }
    succeeded(b, "move", heading);
    b.heading = heading;
    ++b.stats["walks"];
    const double eta = std::ceil(distance(from, dest) / w.content().sim().walkSpeedMetersPerSecond);
    log(w, b, "walk", "walks to " + label + ", about " + std::to_string(static_cast<int>(eta)) + " s");
    pause(b, std::min(std::max(eta, 1.0) + 1, 12.0));
  }

  void ride(World& w, Bot& b, const TransitLine& line, const TransitStop& s1, const TransitStop& s2,
            const LocationId& target) {
    if (waiting(b, "ride", s2.id)) return;
    ++b.stats["commands"];
    auto r = w.ride(b.id, s2.id, true, "card");
    if (!r) {
      const std::string& code = r.error().code;
      if (code == "no_service" || code == "insufficient_funds" || code == "unknown_stop" || code == "invalid_payment")
        b.noBusUntil = clock + jittered(w, 600);  // walk for a while
      refused(w, b, "ride", s2.id, r.error());
      return;
    }
    succeeded(b, "ride", s2.id);
    if (r.value().value("caught", false)) {  // only fare dodgers are inspected, and the autopilot always pays
      log(w, b, "ride", "a fare inspector stopped the ride");
      pause(b, 2);
      return;
    }
    b.riding = true;
    b.heading = target;
    ++b.stats["rides"];
    const double eta = r.value().value("eta_seconds", 5.0);
    log(w, b, "ride", "rides " + line.name + " from " + s1.name + " to " + s2.name + ": fare " +
                          formatMoney(r.value().value("fare_cents", Cents{0})) + " by card, about " +
                          std::to_string(static_cast<int>(eta)) + " s");
    pause(b, std::min(eta + 1, 15.0));
  }

  void enter(World& w, Bot& b, const Goal& goal, DayPlan& plan, GameMinutes now) {
    const LocationId target = goal.place.empty() ? b.ctx.home : goal.place;
    if (waiting(b, "enter", target)) return;
    ++b.stats["commands"];
    Status st = w.enter(b.id, target);
    if (st) {
      succeeded(b, "enter", target);
      ++b.stats["enters"];
      b.heading.clear();
      log(w, b, "enter", "goes into " + nameOf(w, target));
      pause(b, jittered(w, 1.5));
      return;
    }
    const std::string& code = st.error().code;
    if (code == "inside_building") {
      pause(b, 2);  // the next look shows where we are
      return;
    }
    if (code == "closed" && goal.kind != Kind::Sleep) {
      const LocationDef* loc = w.content().location(target);
      const int wait = loc ? opensWithin(*loc, now, kWaitForOpening) : -1;
      if (wait > 0) {
        logOnce(w, b, "wait|" + target + "|" + std::to_string(plan.day), "wait",
                nameOf(w, target) + " is closed; waits at the door (opens in about " + std::to_string(wait) + " min)");
        // `wait` is game minutes; the pause is real seconds.
        const double rate = std::max(w.content().sim().minutesPerRealSecond, 0.01);
        pause(b, std::clamp(wait / rate, 1.5, 15.0));
        return;
      }
    }
    if (code == "too_far" || code == "riding" || code == "in_jail") {
      refused(w, b, "enter", target, st.error(), 2);
      return;
    }
    if (goal.kind == Kind::Sleep) {  // can't get home: go to bed from where we are
      log(w, b, "home", "can't get into " + nameOf(w, target) + " (" + code + ": " + st.error().message + ")");
      goToBed(w, b, plan, "outdoors");
      return;
    }
    skip(w, b, plan, goal, code + " (" + st.error().message + ")");
    refused(w, b, "enter", target, st.error(), 10);
  }

  void leaveBuilding(World& w, Bot& b, const std::string& why) {
    if (waiting(b, "exit", "")) return;
    ++b.stats["commands"];
    auto r = w.exitBuilding(b.id);
    if (!r) {
      if (r.error().code != "not_inside") refused(w, b, "exit", "", r.error(), 10, 300);
      else pause(b, 2);
      return;
    }
    succeeded(b, "exit", "");
    ++b.stats["exits"];
    std::string extra;
    if (r.value().contains("shift") && r.value()["shift"].is_object()) {
      const Json& shift = r.value()["shift"];
      extra = "; that ended the shift: " + formatMoney(shift.value("pay_cents", Cents{0})) + " for " +
              std::to_string(shift.value("minutes_worked", GameMinutes{0})) + " min";
    }
    log(w, b, "exit", "leaves " + nameOf(w, r.value().value("left", std::string())) + " (" + why + ")" + extra);
    pause(b, jittered(w, 1.0));
  }

  void skip(World& w, Bot& b, DayPlan& plan, const Goal& goal, const std::string& why) {
    if (plan.has(goal)) plan.skipped.insert(goal.index);
    if (b.errand && goal.errand && b.errand->second.place == goal.place) {
      b.cooldown[ckey("errand", b.errand->first)] = clock + jittered(w, 60);
      b.cooldown[ckey("place", goal.place)] = clock + jittered(w, 300);
      b.errand.reset();
    }
    log(w, b, "skip", "skips " + nameOf(w, goal.place) + (goal.why.empty() ? "" : " (" + goal.why + ")") + ": " + why);
    pause(b, jittered(w, 2.0));
  }

  void endShift(World& w, Bot& b) {
    if (waiting(b, "work_end", "")) return;
    ++b.stats["commands"];
    auto r = w.endShift(b.id);
    if (!r) {
      if (r.error().code != "not_working") refused(w, b, "work_end", "", r.error(), 10, 300);
      else pause(b, 2);
      return;
    }
    succeeded(b, "work_end", "");
    ++b.stats["shifts"];
    const Json& out = r.value();
    log(w, b, "work", "ends the shift as " + out.value("title", std::string()) + " after " +
                          std::to_string(out.value("minutes_worked", GameMinutes{0})) + " min: paid " +
                          formatMoney(out.value("pay_cents", Cents{0})) +
                          (out.contains("note") ? " (" + out.value("note", std::string()) + ")" : "") +
                          (out.contains("promoted_to")
                               ? ". Promoted to " + out.value("promoted_to", std::string()) + "!"
                               : ""));
    pause(b, 2);
  }

  // One activity; true when a command went out (whatever the answer).
  bool doActivity(World& w, Bot& b, const std::string& activity, const std::string& why) {
    if (cooling(b, "activity", activity)) return false;
    ++b.stats["commands"];
    auto r = w.useActivity(b.id, activity);
    if (!r) {
      if (r.error().code == "too_soon") {
        b.cooldown[ckey("activity", activity)] = clock + jittered(w, 60);
        pause(b, 2);
        return true;
      }
      refused(w, b, "activity", activity, r.error(), 10, 300);
      return true;
    }
    succeeded(b, "activity", activity);
    ++b.stats["activities"];
    std::string needs;
    const Json after = r.value().value("needs", Json::object());  // a named copy: items() must not outlive its json
    for (const auto& [k, v] : after.items())
      needs += (needs.empty() ? "" : ", ") + k + " " + std::to_string(static_cast<int>(v.get<double>()));
    log(w, b, "activity", r.value().value("label", activity) + (why.empty() ? "" : " (" + why + ")") +
                              (needs.empty() ? "" : ": " + needs));
    pause(b, jittered(w, 1.5));
    return true;
  }

  // The one everyday purchase of the day (an errand for food is allowed on top): the offer that helps the lowest
  // needs most, by card. Affordability is the world's call: insufficient_funds backs off like any refusal.
  bool buyEveryday(World& w, Bot& b, const LocationDef& place, const Json& needs, const std::string& need,
                   std::int64_t day) {
    if (cooling(b, "buy", place.id)) return false;
    if (need.empty() && b.boughtOn == day) return false;
    const Offer* best = nullptr;
    double bestValue = 0;
    for (const Offer* o : everydayOffers(place)) {
      if (!need.empty()) {
        auto it = o->needEffects.find(need);
        if (it == o->needEffects.end() || it->second <= 0) continue;
      }
      double gain = 0;
      for (const auto& [k, v] : o->needEffects) {
        if (v > 0) gain += v * (100 - needOf(needs, k));
      }
      if (!best || gain > bestValue || (gain == bestValue && o->priceCents < best->priceCents)) {
        best = o;
        bestValue = gain;
      }
    }
    if (!best) return false;
    ++b.stats["commands"];
    auto r = w.buy(b.id, best->id, "card");
    if (!r) {
      refused(w, b, "buy", place.id, r.error(), 30, 900);
      return true;
    }
    succeeded(b, "buy", place.id);
    ++b.stats["buys"];
    if (need.empty()) b.boughtOn = day;
    log(w, b, "buy", "buys " + r.value().value("item", best->id) + " at " + place.name + ": " +
                         formatMoney(r.value().value("price_cents", Cents{0})) + " by card, balance " +
                         formatMoney(r.value().value("balance_cents", Cents{0})));
    pause(b, jittered(w, 1.5));
    return true;
  }

  // An evening's offer (a dinner, a film ticket), by card. Affordability is the world's call.
  bool buyOffer(World& w, Bot& b, const LocationDef& place, const std::string& offer, const std::string& why,
                std::int64_t day) {
    if (cooling(b, "buy", place.id)) return false;
    ++b.stats["commands"];
    auto r = w.buy(b.id, offer, "card");
    if (!r) {
      refused(w, b, "buy", place.id, r.error(), 30, 900);
      return true;
    }
    succeeded(b, "buy", place.id);
    ++b.stats["buys"];
    b.boughtOn = day;
    log(w, b, "buy", "buys " + r.value().value("item", offer) + " at " + place.name + " (" + why + "): " +
                         formatMoney(r.value().value("price_cents", Cents{0})) + " by card");
    pause(b, jittered(w, 1.5));
    return true;
  }

  // On shift and flagging (D-073): the workplace's own energy activity (a break-room coffee), else the cheapest
  // everyday offer it sells that gives energy (a barista's own latte). At most one every kPickMeUpEveryMinutes.
  bool pickMeUp(World& w, Bot& b, const LocationDef& place, const Json& needs, const std::string& why,
                double below = kPickMeUpBelow) {
    if (needOf(needs, "energy") >= below || cooling(b, "pickmeup", "")) return false;
    const std::string act = activityFor(place, "energy");
    if (!act.empty() && !cooling(b, "activity", act)) {
      b.cooldown[ckey("pickmeup", "")] = clock + realSeconds(w, kPickMeUpEveryMinutes);
      if (doActivity(w, b, act, why)) return true;
    }
    const Offer* best = nullptr;
    for (const Offer* o : everydayOffers(place)) {
      const auto it = o->needEffects.find("energy");
      if (it == o->needEffects.end() || it->second <= 0) continue;
      if (!best || it->second > best->needEffects.at("energy")) best = o;
    }
    if (!best || cooling(b, "buy", place.id)) return false;
    b.cooldown[ckey("pickmeup", "")] = clock + realSeconds(w, kPickMeUpEveryMinutes);
    ++b.stats["commands"];
    auto r = w.buy(b.id, best->id, "card");
    if (!r) {
      refused(w, b, "buy", place.id, r.error(), 30, 900);
      return true;
    }
    succeeded(b, "buy", place.id);
    ++b.stats["buys"];
    log(w, b, "buy", "buys " + r.value().value("item", best->id) + " at " + place.name + " (" + why + ")");
    pause(b, jittered(w, 1.5));
    return true;
  }

  // ------------------------------------------------------------------ the beat (D-073)
  // At the base on shift: a round starts once the last one ended `every_minutes` ago and an hour of the shift is left.
  bool startRound(World& w, Bot& b, const Goal& goal, GameMinutes now) {
    const PatrolDef* beat = b.ctx.patrol;
    if (!beat || beat->beat.empty() || !b.ctx.worksOutdoors) return false;
    const int mod = static_cast<int>(now % kMinutesPerDay);
    if (b.patrol.lastEnd < 0 || b.patrol.lastEnd > now) b.patrol.lastEnd = now;
    if (now - b.patrol.lastEnd < beat->everyMinutes || goal.end - mod < 60) return false;
    const std::int64_t day = now / kMinutesPerDay;
    b.patrol.active = true;
    b.patrol.left = beat->stops;
    b.patrol.stop = static_cast<int>(dayhash::dayKey(b.id, day, "patrol:" + std::to_string(b.patrol.round)) %
                                     beat->beat.size());
    b.patrol.lingerUntil = -1;
    b.patrol.coffee = false;
    ++b.patrol.round;
    ++b.stats["patrols"];
    log(w, b, "patrol", "starts a round of the beat at " + nameOf(w, beat->beat[static_cast<std::size_t>(b.patrol.stop)]));
    leaveBuilding(w, b, "on the beat");
    return true;
  }

  // One turn of a round: walk to the next place on the beat, stay a few minutes on foot (in for a coffee if they need
  // one and it's sold there), then the next; after the last, back to the base. The shift carries on throughout: the
  // career works outdoors (World::exitBuilding keeps it), and that's what puts an officer in uniform on the street.
  void walkBeat(World& w, Bot& b, const Json& look, GameMinutes now) {
    const PatrolDef& beat = *b.ctx.patrol;
    const Json& you = look["you"];
    const Json needs = you.value("needs", Json::object());
    const std::string inside = you.value("inside", std::string());
    const Vec2 pos = positionOf(you);
    const ContentDatabase& db = w.content();
    if (b.patrol.left <= 0) {
      if (inside == beat.base) {
        b.patrol.active = false;
        b.patrol.lastEnd = now;
        log(w, b, "patrol", "back at " + nameOf(w, beat.base) + " from the beat");
        pause(b, 2);
        return;
      }
      if (!inside.empty()) {
        leaveBuilding(w, b, "back to " + nameOf(w, beat.base));
        return;
      }
      const LocationDef* base = db.location(beat.base);
      if (!base) {
        b.patrol.active = false;
        return;
      }
      if (distance(pos, base->door) <= db.sim().entryRadiusMeters - 0.5) {
        if (waiting(b, "enter", beat.base)) return;
        ++b.stats["commands"];
        if (Status st = w.enter(b.id, beat.base); !st) refused(w, b, "enter", beat.base, st.error(), 5);
        else pause(b, jittered(w, 1.5));
        return;
      }
      if (you.value("moving", false) && b.heading == beat.base) {
        pause(b, 10);
        return;
      }
      walkTo(w, b, pos, base->door, beat.base, base->name + " (back from the beat)");
      return;
    }
    const LocationId stopId = beat.beat[static_cast<std::size_t>(b.patrol.stop) % beat.beat.size()];
    const LocationDef* stop = db.location(stopId);
    if (!inside.empty()) {
      // In for a coffee: buy it, then straight back out.
      if (inside == stopId && b.patrol.coffee && stop) {
        b.patrol.coffee = false;
        if (pickMeUp(w, b, *stop, needs, "a coffee on the beat", 101)) return;
      }
      leaveBuilding(w, b, "back on the beat");
      return;
    }
    if (!stop) {
      b.patrol.left = 0;
      return;
    }
    const double reach = stop->enterable ? db.sim().entryRadiusMeters : stop->outdoorRadius;
    if (distance(pos, stop->door) > reach) {
      if (you.value("moving", false) && b.heading == stopId) {
        pause(b, 10);
        return;
      }
      walkTo(w, b, pos, stop->door, stopId, stop->name + " (on the beat)");
      return;
    }
    if (b.patrol.lingerUntil < 0) {
      b.patrol.lingerUntil = now + beat.lingerMinutes;
      log(w, b, "patrol", "walks the beat past " + stop->name);
    }
    // A coffee if they're flagging and it's sold here, open now.
    if (needOf(needs, "energy") < kPatrolCoffeeBelow && stop->enterable && isOpen(*stop, now) &&
        !cooling(b, "pickmeup", "") && !cooling(b, "enter", stopId)) {
      const auto offers = everydayOffers(*stop);
      const bool sells = std::any_of(offers.begin(), offers.end(), [](const Offer* o) {
        const auto it = o->needEffects.find("energy");
        return it != o->needEffects.end() && it->second > 0;
      });
      if (sells) {
        ++b.stats["commands"];
        if (Status st = w.enter(b.id, stopId)) {
          b.patrol.coffee = true;
          pause(b, jittered(w, 1.5));
        } else {
          refused(w, b, "enter", stopId, st.error(), 10);
        }
        return;
      }
    }
    if (now < b.patrol.lingerUntil) {
      pause(b, std::max(2.0, std::min(kIdleCapSeconds, realSeconds(w, static_cast<double>(b.patrol.lingerUntil - now)))));
      return;
    }
    b.patrol.stop = (b.patrol.stop + 1) % static_cast<int>(beat.beat.size());
    --b.patrol.left;
    b.patrol.lingerUntil = -1;
    pause(b, 2);
  }

  // One activity for the lowest need under its threshold that this place helps with.
  bool care(World& w, Bot& b, const LocationDef& place, const Json& needs,
            const std::map<std::string, double>& thresholds, const std::string& why) {
    std::vector<std::pair<double, std::string>> low;
    for (const auto& [need, limit] : thresholds) {
      if (needOf(needs, need) < limit) low.emplace_back(needOf(needs, need), need);
    }
    std::sort(low.begin(), low.end());
    for (const auto& [v, need] : low) {
      const std::string act = activityFor(place, need);
      if (!act.empty() && !cooling(b, "activity", act) && doActivity(w, b, act, why)) return true;
    }
    return false;
  }

  void atPlace(World& w, Bot& b, const Json& look, const Goal& goal, DayPlan& plan, GameMinutes now) {
    const Json& you = look["you"];
    const Json needs = you.value("needs", Json::object());
    const LocationId placeId = goal.place.empty() ? b.ctx.home : goal.place;
    const LocationDef* place = w.content().location(placeId);
    if (!place) {
      skip(w, b, plan, goal, "no such place");
      return;
    }
    const std::string dayKey = std::to_string(plan.day);
    std::set<std::string>& done = b.done[goal.ident()];
    if (goal.kind == Kind::Sleep) {
      if (!b.routineDone.count(dayKey + "/bed")) {
        if (care(w, b, *place, needs, kBedCare, "before bed")) return;
        b.routineDone.insert(dayKey + "/bed");
      }
      goToBed(w, b, plan, "at home");
      return;
    }
    if (b.errand && goal.errand) {
      const std::string need = b.errand->first;
      if (need == "hunger" && !done.count("food")) {
        done.insert("food");
        if (buyEveryday(w, b, *place, needs, "hunger", plan.day)) return;
      }
      const std::string act = !goal.activity.empty() ? goal.activity : activityFor(*place, need);
      if (!act.empty() && !done.count(act)) {
        done.insert(act);
        if (doActivity(w, b, act, goal.why)) return;
      }
      // Nothing more this place can do for it.
      b.cooldown[ckey("errand", need)] = clock + jittered(w, 90);
      if (needOf(needs, need) < kNeedRecovered.at(need)) {
        b.cooldown[ckey("place", placeId)] = clock + jittered(w, 600);
        if (need == "energy" && placeId == b.ctx.home) {
          b.errand.reset();
          goToBed(w, b, plan, "early, exhausted");
          return;
        }
      }
      b.errand.reset();
      pause(b, 2);
      return;
    }
    if (goal.kind == Kind::Work) {
      if (!you.value("on_shift", false)) {
        if (waiting(b, "work_start", placeId)) return;
        ++b.stats["commands"];
        if (Status st = w.startShift(b.id)) {
          succeeded(b, "work_start", placeId);
          ++b.stats["shift_starts"];
          log(w, b, "work", "starts a shift at " + place->name + " (until about " + hhmm(goal.end) + ")");
          b.patrol = PatrolState{};
          // The first round of a beat starts a little into the shift.
          if (b.ctx.patrol) b.patrol.lastEnd = now - std::max(0, b.ctx.patrol->everyMinutes - 20);
          pause(b, 2);
          return;
        } else {
          const std::string& code = st.error().code;
          if (code == "no_career" || code == "wrong_place" || code == "no_employer")
            skip(w, b, plan, goal, st.error().message);
          refused(w, b, "work_start", placeId, st.error(), 15, 600);
          return;
        }
      }
      // On shift (D-073): the restroom at work, a pick-me-up when they're flagging, and the beat for a job that walks one.
      if (care(w, b, *place, needs, kShiftCare, "on a break")) return;
      if (pickMeUp(w, b, *place, needs, "a pick-me-up on shift")) return;
      if (startRound(w, b, goal, now)) return;
      idle(w, b, goal, now);
      return;
    }
    if (goal.kind == Kind::Home) {
      if (!b.routineDone.count(dayKey + "/morning") && (now % kMinutesPerDay) < 12 * 60) {
        if (care(w, b, *place, needs, kMorningCare, "morning")) return;
        b.routineDone.insert(dayKey + "/morning");
      }
      // A rest, a meal and the bathroom before a shift or an evening out that starts soon (D-073).
      const int mod = static_cast<int>(now % kMinutesPerDay);
      for (const auto& next : plan.blocks) {
        if (next.start <= mod) continue;
        if ((next.kind == Kind::Work || next.kind == Kind::Place) && next.start - mod <= kRestWithinMinutes &&
            !plan.skipped.count(next.index) && care(w, b, *place, needs, kRestBefore, "before " + nameOf(w, next.place)))
          return;
        break;
      }
      if (care(w, b, *place, needs, kHomeCare, "at home")) return;
      idle(w, b, goal, now);
      return;
    }
    // A scheduled place: what the schedule names there, an evening's offer (D-073), the day's everyday purchase, the
    // restroom.
    if (!goal.activity.empty() && !done.count(goal.activity)) {
      done.insert(goal.activity);
      if (doActivity(w, b, goal.activity, goal.why)) return;
    }
    if (!goal.offer.empty() && !done.count("offer")) {
      done.insert("offer");
      done.insert("buy");  // it's the day's purchase
      if (buyOffer(w, b, *place, goal.offer, goal.why, plan.day)) return;
    }
    if (!done.count("buy")) {
      done.insert("buy");
      if (buyEveryday(w, b, *place, needs, "", plan.day)) return;
    }
    if (!done.count("restroom") && needOf(needs, "bladder") < 60) {
      done.insert("restroom");
      const std::string act = activityFor(*place, "bladder");
      if (!act.empty() && doActivity(w, b, act, "while here")) return;
    }
    idle(w, b, goal, now);
  }

  // Nothing to do until this block ends: look again soon (a dev time skip moves the clock without warning).
  void idle(const World& w, Bot& b, const Goal& goal, GameMinutes now) {
    const double rate = std::max(w.content().sim().minutesPerRealSecond, 0.01);
    double leftMinutes = goal.end ? goal.end - static_cast<double>(now % kMinutesPerDay) : kIdleCapSeconds * rate;
    // Look again in time to leave for what comes next: the walk or the ride there takes game time, and a long pause
    // would have them set off late (at two game minutes a real second, the cap alone is 40 minutes).
    if (goal.end && b.plan.has(goal) && goal.index + 1 < static_cast<int>(b.plan.blocks.size())) {
      const Goal& next = b.plan.blocks[static_cast<std::size_t>(goal.index) + 1];
      const LocationDef* here = w.content().location(goal.place.empty() ? b.ctx.home : goal.place);
      const LocationId there = next.place.empty() ? b.ctx.home : next.place;
      if (here && there != here->id) leftMinutes -= etaMinutes(w, b, here->door, there, now) + kTravelSlack;
    }
    pause(b, std::max(2.0, std::min(kIdleCapSeconds, leftMinutes / rate - 2)));
  }

  // ------------------------------------------------------------------ one turn
  void turn(World& w, Bot& b) {
    if (clock < b.heldUntil) {
      pause(b, b.heldUntil - clock);
      return;
    }
    if (!b.pendingAsks.empty()) {
      const Json ask = b.pendingAsks.front();
      b.pendingAsks.erase(b.pendingAsks.begin());
      const std::string rid = ask.value("id", std::string());
      if (!rid.empty() && b.playing) {
        const std::string kind = ask.value("kind", std::string("?"));
        const std::string from = ask.value("from", std::string("someone"));
        std::string why;
        const bool yes = acceptsAsk(w, b, kind, from, why);
        ++b.stats["commands"];
        auto r = w.respond(b.id, rid, yes);
        ++b.stats[yes ? "asks_accepted" : "asks_declined"];
        log(w, b, yes ? "accept" : "decline",
            std::string(yes ? "accepts" : "declines") + " a '" + kind + "' ask from " + from + " (" + why + ")" +
                (r ? "" : "; the world said " + r.error().code));
        pause(b, 2);
        return;
      }
    }
    if (b.playing) play(w, b);
    else offstage(w, b);
  }
};

// --- Public interface ------------------------------------------------------------------------------
Autopilot::Autopilot() : impl_(std::make_unique<Impl>()) {}
Autopilot::~Autopilot() = default;
Autopilot::Autopilot(Autopilot&&) noexcept = default;
Autopilot& Autopilot::operator=(Autopilot&&) noexcept = default;

void Autopilot::start(World& world, const std::vector<CharacterId>& ids) {
  for (const auto& id : ids) {
    if (impl_->bots.count(id)) continue;
    const CharacterDef* def = world.definition(id);
    if (!def || !def->playable) continue;
    // Someone is already in the world as them (a person, or a script session): not ours to take.
    if (const CharacterState* c = world.character(id); c && c->online) continue;
    Impl::Bot& b = impl_->bots[id];
    b.id = id;
    b.first = def->firstName;
    b.nextActAt = impl_->clock;
    impl_->turn(world, b);  // enters the world now if the routine says awake, so a fresh server has its people at once
    if (b.finished) impl_->bots.erase(id);
    else b.nextActAt += world.roll() * kCommandIntervalSeconds;  // spread the characters' turns over the interval
  }
}

void Autopilot::stop(World& world) {
  for (auto& [id, b] : impl_->bots) {
    if (b.playing) world.disconnect(id);  // ends a shift itself
    world.setScripted(id, false);
  }
  impl_->bots.clear();
}

void Autopilot::release(World& world, const CharacterId& id) {
  if (!impl_->bots.erase(id)) return;
  world.setScripted(id, false);
}

bool Autopilot::runs(const CharacterId& id) const { return impl_->bots.count(id) > 0; }

std::vector<CharacterId> Autopilot::characters() const {
  std::vector<CharacterId> out;
  for (const auto& [id, b] : impl_->bots) out.push_back(id);
  return out;
}

void Autopilot::step(World& world, double realSeconds) {
  impl_->clock += std::max(0.0, realSeconds);
  for (auto it = impl_->bots.begin(); it != impl_->bots.end();) {
    Impl::Bot& b = it->second;
    if (impl_->clock >= b.nextActAt) impl_->turn(world, b);
    if (b.finished) it = impl_->bots.erase(it);
    else ++it;
  }
}

void Autopilot::observe(const std::vector<WorldEvent>& events) {
  for (const auto& ev : events) {
    for (const auto& who : ev.recipients) {
      auto it = impl_->bots.find(who);
      if (it == impl_->bots.end()) continue;
      if (ev.type == "request") {
        it->second.pendingAsks.push_back(ev.data);
        // An ask lapses in minutes: answer on the next turn the two-second rule allows, not after a long idle.
        it->second.nextActAt = std::min(it->second.nextActAt, impl_->clock + kCommandIntervalSeconds);
      } else if (ev.type == "arrived") {
        it->second.riding = false;
      }
    }
  }
}

void Autopilot::setLog(std::function<void(const std::string&)> log) { impl_->logSink = std::move(log); }

Json Autopilot::status() const {
  Json out = Json::object();
  for (const auto& [id, b] : impl_->bots) {
    Json stats = Json::object();
    for (const auto& [k, v] : b.stats) stats[k] = v;
    out[id] = Json{{"playing", b.playing},
                   {"asleep", !b.playing && b.sleptOn >= 0},
                   {"plan", b.plan.day < 0 ? "" : "wake " + hhmm(b.plan.wake) + ", bed " + hhmm(b.plan.bed)},
                   {"blocks", b.plan.blocks.size()},
                   {"tonight", b.tonight},
                   {"on_patrol", b.patrol.active},
                   {"heading", b.heading},
                   {"stats", stats}};
  }
  return out;
}

}  // namespace livera
