// Social media on the phone (D-074): how word gets around. Posts are World state built from real events: people
// post what they choose (the post op), characters a script plays post from their own memories and check-ins (in
// their own voice, from data/society/social.json), and the anonymous gossip account posts the scenes people
// witnessed, from the rumours the World keeps (Details.cpp). People follow, like and comment; followers and likes
// add a little fame and warm the author's side of the relationship.
//
// What reaches a screen follows rule 5: every post is public (the town tab), a person's feed holds the people they
// follow, themselves, posts they're in, and gossip they follow or that reached them; nobody's messages, feelings or
// who-heard-what lists ever leave the World, and whether a gossip post is true is shown only to the people who were
// there. Chances come from a hash of what is being decided, never from the world's random stream, so posting never
// changes anyone's dice.
#include <algorithm>
#include <cctype>
#include <cmath>
#include <set>

#include "core/Clock.h"
#include "core/Content.h"
#include "core/ContentParse.h"
#include "core/DayHash.h"
#include "core/Parts.h"
#include "core/World.h"

namespace livera {

using namespace content_parse;

namespace {

const std::set<std::string> kMomentPlaceholders{"first", "place", "with", "title", "pet", "item"};
const std::set<std::string> kGossipPlaceholders{"about", "with", "place"};
// The scenes the World reports (World::witnessed's callers): the gossip account's kinds must be among them.
const std::set<std::string> kWitnessedKinds{"fight", "argument", "arrest", "kiss", "accident"};

bool has(const std::vector<std::string>& v, const std::string& x) { return std::find(v.begin(), v.end(), x) != v.end(); }

// Uniform [0, 1) from a hash of what's being decided.
double unit(const std::string& key) {
  return static_cast<double>(dayhash::mix64(dayhash::fnv1a(key)) >> 11) * (1.0 / 9007199254740992.0);
}

std::string trimmed(const std::string& s) {
  const auto b = s.find_first_not_of(" \t\r\n");
  if (b == std::string::npos) return "";
  const auto e = s.find_last_not_of(" \t\r\n");
  return s.substr(b, e - b + 1);
}

// Control characters could forge lines in a client's list; they become spaces.
std::string cleanText(const std::string& text) {
  std::string out = text;
  for (char& ch : out) {
    if (static_cast<unsigned char>(ch) < 0x20 || ch == 0x7f) ch = ' ';
  }
  return trimmed(out);
}

// Characters, not bytes: "é" is one.
int textLength(const std::string& s) {
  int n = 0;
  for (const unsigned char ch : s) n += (ch & 0xC0) != 0x80 ? 1 : 0;
  return n;
}

// The {placeholders} a line uses.
std::set<std::string> placeholdersOf(const std::string& line) {
  std::set<std::string> out;
  for (std::size_t at = line.find('{'); at != std::string::npos; at = line.find('{', at + 1)) {
    const auto end = line.find('}', at);
    if (end == std::string::npos) break;
    out.insert(line.substr(at + 1, end - at - 1));
  }
  return out;
}

// The line with its placeholders filled, or "" when one of them has no value.
std::string fillLine(const std::string& line, const std::map<std::string, std::string>& values) {
  std::string out;
  std::size_t from = 0;
  for (std::size_t at = line.find('{'); at != std::string::npos; at = line.find('{', from)) {
    const auto end = line.find('}', at);
    if (end == std::string::npos) break;
    const auto it = values.find(line.substr(at + 1, end - at - 1));
    if (it == values.end() || it->second.empty()) return "";
    out += line.substr(from, at - from) + it->second;
    from = end + 1;
  }
  return out + line.substr(from);
}

// The first line (in an order the key picks) whose placeholders all have values.
std::string pickLine(const std::vector<std::string>& lines, const std::map<std::string, std::string>& values,
                     const std::string& key) {
  if (lines.empty()) return "";
  const std::size_t start = static_cast<std::size_t>(dayhash::mix64(dayhash::fnv1a(key)) % lines.size());
  for (std::size_t i = 0; i < lines.size(); ++i) {
    std::string out = fillLine(lines[(start + i) % lines.size()], values);
    if (!out.empty()) return out;
  }
  return "";
}

Status checkDims(const StatMap& m, const std::vector<std::string>& dims, const std::string& where) {
  for (const auto& [k, v] : m) {
    if (!has(dims, k)) return fail("content_invalid", where + ": unknown relationship dimension '" + k + "'");
  }
  return okStatus();
}

std::string firstNameOf(const CharacterDef* d, const std::string& id) { return d ? d->firstName : id; }

}  // namespace

// ---- Content -------------------------------------------------------------------------------
const SocialMomentDef* SocialConfig::moment(const std::string& memory) const {
  for (const auto& m : moments) {
    if (m.memory == memory) return &m;
  }
  return nullptr;
}

const SocialGossipKindDef* SocialConfig::gossipKind(const std::string& kind) const {
  for (const auto& k : gossipKinds) {
    if (k.kind == kind) return &k;
  }
  return nullptr;
}

Status ContentDatabase::ingestSocial(const std::string& source, const std::string& section, const Json& body, bool& handled) {
  handled = section == "social";
  if (!handled) return okStatus();
  if (social_.enabled) return fail("content_duplicate", source + ": 'social' defined twice");
  static const std::set<std::string> kKeys{"post", "comment", "like", "follow", "feed", "fame", "relationship",
                                           "notify", "seed_follows", "status_purchase", "topics", "auto", "unfiltered"};
  try {
    for (const auto& [k, v] : body.items()) {
      if (!kKeys.count(k)) return fail("content_invalid", source + ": social: unknown key '" + k + "'");
    }
    SocialConfig& S = social_;
    S.enabled = true;
    const Json post = body.value("post", Json::object());
    S.postMaxLength = post.value("max_length", S.postMaxLength);
    S.postMinGapMinutes = post.value("min_gap_minutes", S.postMinGapMinutes);
    S.postsPerDay = post.value("per_day", S.postsPerDay);
    S.maxTags = post.value("max_tags", S.maxTags);
    const Json comment = body.value("comment", Json::object());
    S.commentMaxLength = comment.value("max_length", S.commentMaxLength);
    S.commentMinGapMinutes = comment.value("min_gap_minutes", S.commentMinGapMinutes);
    S.commentsPerDay = comment.value("per_day", S.commentsPerDay);
    S.commentsPerPost = comment.value("per_post", S.commentsPerPost);
    S.likesPerDay = body.value("like", Json::object()).value("per_day", S.likesPerDay);
    S.maxFollowing = body.value("follow", Json::object()).value("max_following", S.maxFollowing);
    const Json feed = body.value("feed", Json::object());
    S.feedLimit = feed.value("limit", S.feedLimit);
    S.keptPosts = feed.value("kept_posts", S.keptPosts);
    S.commentsShown = feed.value("comments_shown", S.commentsShown);
    S.activityKept = feed.value("activity_kept", S.activityKept);
    S.mapPostHours = feed.value("map_post_hours", S.mapPostHours);
    const Json fame = body.value("fame", Json::object());
    S.famePerFollower = fame.value("per_follower", S.famePerFollower);
    S.famePerLike = fame.value("per_like", S.famePerLike);
    S.fameMaxPerDay = fame.value("max_per_day", S.fameMaxPerDay);
    const Json rel = body.value("relationship", Json::object());
    S.likeRelationship = readStats(rel, "like");
    S.commentRelationship = readStats(rel, "comment");
    S.followRelationship = readStats(rel, "follow");
    S.notifyPerHour = body.value("notify", Json::object()).value("per_hour", S.notifyPerHour);
    S.seedFollowMin = readStats(body.value("seed_follows", Json::object()), "min");
    const Json sp = body.value("status_purchase", Json::object());
    S.statusMinPriceCents = sp.value("min_price_cents", Cents{0});
    S.statusCategories = readStrings(sp, "categories");
    S.statusExcept = readStrings(sp, "except");
    const Json topics = body.value("topics", Json::object());
    for (const auto& [k, v] : topics.items()) S.topics[k] = v.get<std::string>();

    const Json au = body.value("auto", Json::object());
    S.autoPerDay = au.value("per_day", S.autoPerDay);
    S.autoMinGapMinutes = au.value("min_gap_minutes", S.autoMinGapMinutes);
    const std::vector<int> delay = readInts(au, "delay_minutes");
    if (delay.size() == 2) {
      S.autoDelayMin = delay[0];
      S.autoDelayMax = delay[1];
    } else if (!delay.empty()) {
      return fail("content_invalid", source + ": social.auto.delay_minutes is [min, max]");
    }
    S.autoKeepHours = au.value("keep_hours", S.autoKeepHours);
    S.autoTrait = au.value("trait", "");
    S.autoBase = au.value("base", S.autoBase);
    S.autoPerTrait = au.value("per_trait", S.autoPerTrait);
    S.checkinPlaceTypes = readStrings(au, "checkin_place_types");
    S.checkinTagMinFriendship = au.value("checkin_tag_min_friendship", S.checkinTagMinFriendship);
    for (const auto& v : au.value("voices", Json::array()))
      S.voices.push_back(SocialVoiceDef{v.at("id").get<std::string>(), readStats(v, "min"), readStats(v, "max")});
    for (const auto& m : au.value("moments", Json::array())) {
      SocialMomentDef d;
      d.memory = m.at("memory").get<std::string>();
      d.topic = m.at("topic").get<std::string>();
      d.chance = m.value("chance", 1.0);
      for (const auto& [voice, lines] : m.at("lines").items()) d.lines[voice] = lines.get<std::vector<std::string>>();
      S.moments.push_back(std::move(d));
    }

    const Json un = body.value("unfiltered", Json::object());
    S.unfilteredHandle = un.value("handle", "");
    S.unfilteredName = un.value("name", "");
    S.unfilteredBio = un.value("bio", "");
    S.unfilteredSecret = un.value("run_by_secret", "");
    S.unfilteredMinHeard = un.value("min_heard", S.unfilteredMinHeard);
    S.unfilteredDelayMinutes = un.value("delay_minutes", S.unfilteredDelayMinutes);
    S.unfilteredPerDay = un.value("per_day", S.unfilteredPerDay);
    S.unfilteredTwistChance = un.value("twist_chance", S.unfilteredTwistChance);
    for (const auto& k : un.value("kinds", Json::array())) {
      SocialGossipKindDef d;
      d.kind = k.at("kind").get<std::string>();
      d.topic = k.at("topic").get<std::string>();
      d.chance = k.value("chance", 1.0);
      d.interactions = readStrings(k, "interactions");
      d.placeTypes = readStrings(k, "place_types");
      d.relationship = readStats(k, "relationship");
      d.lines = readStrings(k, "lines");
      d.twisted = readStrings(k, "twisted");
      S.gossipKinds.push_back(std::move(d));
    }
  } catch (const std::exception& e) {
    return fail("content_invalid", source + ": social: " + e.what());
  }
  return okStatus();
}

Status ContentDatabase::validateSocial() {
  SocialConfig& S = social_;
  if (!S.enabled) return okStatus();
  const std::string w = "social";
  if (S.postMaxLength < 1 || S.postMaxLength > 2000 || S.commentMaxLength < 1 || S.commentMaxLength > 2000)
    return fail("content_invalid", w + ": max_length is 1-2000");
  for (int v : {S.postMinGapMinutes, S.commentMinGapMinutes, S.maxTags, S.autoMinGapMinutes, S.autoDelayMin, S.notifyPerHour,
                S.unfilteredDelayMinutes, S.unfilteredPerDay, S.unfilteredMinHeard, S.mapPostHours}) {
    if (v < 0) return fail("content_invalid", w + ": counts and minutes can't be negative");
  }
  for (int v : {S.postsPerDay, S.commentsPerDay, S.commentsPerPost, S.likesPerDay, S.maxFollowing, S.feedLimit, S.keptPosts,
                S.activityKept, S.autoKeepHours}) {
    if (v < 1) return fail("content_invalid", w + ": limits must be at least 1");
  }
  if (S.autoDelayMax < S.autoDelayMin) return fail("content_invalid", w + ".auto.delay_minutes: min <= max");
  for (double v : {S.famePerFollower, S.famePerLike, S.fameMaxPerDay}) {
    if (v < 0 || v > 100) return fail("content_invalid", w + ".fame: 0-100");
  }
  const auto& dims = sim_.relationshipDimensions;
  if (auto st = checkDims(S.likeRelationship, dims, w + ".relationship.like"); !st) return st;
  if (auto st = checkDims(S.commentRelationship, dims, w + ".relationship.comment"); !st) return st;
  if (auto st = checkDims(S.followRelationship, dims, w + ".relationship.follow"); !st) return st;
  if (auto st = checkDims(S.seedFollowMin, dims, w + ".seed_follows"); !st) return st;
  for (const auto& id : S.statusExcept) {
    if (!item(id)) return fail("content_invalid", w + ".status_purchase.except: unknown item '" + id + "'");
  }
  for (const auto& cat : S.statusCategories) {
    if (std::none_of(items_.begin(), items_.end(), [&](const auto& kv) { return kv.second.category == cat; }))
      return fail("content_invalid", w + ".status_purchase: no item is in category '" + cat + "'");
  }
  std::set<std::string> placeTypes;
  for (const auto& [id, loc] : locations_) placeTypes.insert(loc.type);
  for (const auto& t : S.checkinPlaceTypes) {
    if (!placeTypes.count(t)) return fail("content_invalid", w + ".auto.checkin_place_types: no place is a '" + t + "'");
  }
  const auto& traits = sim_.personalityTraits;
  if (!S.autoTrait.empty() && !has(traits, S.autoTrait))
    return fail("content_invalid", w + ".auto.trait: unknown personality trait '" + S.autoTrait + "'");
  for (double p : {S.autoBase, S.autoPerTrait, S.unfilteredTwistChance}) {
    if (p < 0 || p > 1) return fail("content_invalid", w + ": chances are 0-1");
  }
  std::set<std::string> voices;
  for (const auto& v : S.voices) {
    if (v.id.empty() || v.id == "default" || !voices.insert(v.id).second)
      return fail("content_invalid", w + ".auto.voices: a voice needs a unique id other than 'default'");
    for (const auto& m : {v.min, v.max}) {
      for (const auto& [t, x] : m) {
        if (!has(traits, t)) return fail("content_invalid", w + ".auto.voices." + v.id + ": unknown trait '" + t + "'");
      }
    }
  }
  auto checkLines = [&](const std::vector<std::string>& lines, const std::set<std::string>& allowed,
                        const std::string& where) -> Status {
    for (const auto& l : lines) {
      if (l.empty() || textLength(l) > S.postMaxLength) return fail("content_invalid", where + ": a line is empty or too long");
      for (const auto& p : placeholdersOf(l)) {
        if (!allowed.count(p)) return fail("content_invalid", where + ": unknown placeholder {" + p + "}");
      }
    }
    return okStatus();
  };
  std::set<std::string> memories;
  for (const auto& m : S.moments) {
    const std::string where = w + ".auto.moments." + m.memory;
    if (m.memory.empty() || !memories.insert(m.memory).second) return fail("content_invalid", where + ": empty or twice");
    if (!S.topics.count(m.topic)) return fail("content_invalid", where + ": unknown topic '" + m.topic + "'");
    if (m.chance < 0 || m.chance > 1) return fail("content_invalid", where + ": chance is 0-1");
    if (!m.lines.count("default") || m.lines.at("default").empty())
      return fail("content_invalid", where + ": needs 'default' lines");
    for (const auto& [voice, lines] : m.lines) {
      if (voice != "default" && !voices.count(voice)) return fail("content_invalid", where + ": unknown voice '" + voice + "'");
      if (auto st = checkLines(lines, kMomentPlaceholders, where); !st) return st;
    }
  }
  if (memories.count("checkin") && S.checkinPlaceTypes.empty())
    return fail("content_invalid", w + ".auto: a checkin moment needs checkin_place_types");
  // The gossip account: a handle that can't be anyone's character id, and a runner from the data's secrets.
  if (!S.gossipKinds.empty() || !S.unfilteredHandle.empty()) {
    if (S.unfilteredHandle.find('.') == std::string::npos || S.unfilteredHandle.find('@') != std::string::npos ||
        characters_.count(S.unfilteredHandle))
      return fail("content_invalid", w + ".unfiltered.handle: a handle with a dot and no @");
    if (S.unfilteredName.empty()) return fail("content_invalid", w + ".unfiltered: needs a name");
    S.unfilteredRunner.clear();
    for (const auto& [id, c] : characters_) {
      for (const auto& s : c.profile.value("secrets", Json::array())) {
        if (s.is_object() && s.value("id", "") == S.unfilteredSecret) S.unfilteredRunner = id;
      }
    }
    if (!S.unfilteredSecret.empty() && S.unfilteredRunner.empty())
      return fail("content_invalid", w + ".unfiltered.run_by_secret: no character has the secret '" + S.unfilteredSecret + "'");
  }
  std::set<std::string> kinds;
  for (const auto& k : S.gossipKinds) {
    const std::string where = w + ".unfiltered.kinds." + k.kind;
    if (!kWitnessedKinds.count(k.kind)) return fail("content_invalid", where + ": the World reports no such scene");
    if (!kinds.insert(k.kind).second) return fail("content_duplicate", where + ": twice");
    if (!S.topics.count(k.topic)) return fail("content_invalid", where + ": unknown topic '" + k.topic + "'");
    if (k.chance < 0 || k.chance > 1) return fail("content_invalid", where + ": chance is 0-1");
    if (k.lines.empty()) return fail("content_invalid", where + ": needs lines");
    for (const auto& i : k.interactions) {
      if (!interaction(i)) return fail("content_invalid", where + ": unknown interaction '" + i + "'");
    }
    for (const auto& t : k.placeTypes) {
      if (!placeTypes.count(t)) return fail("content_invalid", where + ": no place is a '" + t + "'");
    }
    if (auto st = checkDims(k.relationship, dims, where); !st) return st;
    if (auto st = checkLines(k.lines, kGossipPlaceholders, where); !st) return st;
    if (auto st = checkLines(k.twisted, kGossipPlaceholders, where); !st) return st;
  }
  return okStatus();
}

// ---- Accounts --------------------------------------------------------------------------------
bool World::socialAccountExists(const std::string& account) const {
  const SocialConfig& S = content_->social();
  if (!S.unfilteredHandle.empty() && account == S.unfilteredHandle) return true;
  return character(account) != nullptr;
}

std::string World::socialHandleOf(const std::string& account) const {
  const SocialConfig& S = content_->social();
  if (!S.unfilteredHandle.empty() && account == S.unfilteredHandle) return S.unfilteredHandle;
  const CharacterDef* def = definition(account);
  if (!def) return account;
  if (def->profile.is_object()) {
    const Json sm = def->profile.value("social_media", Json::object());
    if (sm.is_object() && sm.contains("handle") && sm["handle"].is_string()) {
      std::string h = sm["handle"].get<std::string>();
      if (!h.empty() && h[0] == '@') h.erase(0, 1);
      if (!h.empty()) return h;
    }
  }
  // Someone made in the creator: first.last, in plain letters.
  std::string h;
  for (const std::string& part : {def->firstName, std::string("."), def->lastName}) {
    for (const unsigned char ch : part) {
      if (std::isalnum(ch) || ch == '.') h += static_cast<char>(std::tolower(ch));
    }
  }
  return h.empty() ? account : h;
}

SocialAccountState& World::socialAccount(const CharacterId& id) {
  SocialAccountState& a = state_.social.accounts[id];
  const std::int64_t today = state_.now / kMinutesPerDay;
  if (a.day != today) {
    a.day = today;
    a.postsToday = a.commentsToday = a.likesToday = a.autoToday = 0;
    a.fameToday = 0;
  }
  return a;
}

bool World::follows(const CharacterId& who, const std::string& account) const {
  auto it = state_.social.accounts.find(who);
  return it != state_.social.accounts.end() && has(it->second.following, account);
}

int World::followerCount(const std::string& account) const {
  int n = 0;
  for (const auto& [id, a] : state_.social.accounts) n += has(a.following, account) ? 1 : 0;
  return n;
}

const SocialPost* World::findPost(const std::string& id) const {
  for (const auto& p : state_.social.posts) {
    if (p.id == id) return &p;
  }
  return nullptr;
}

void World::seedSocial() {
  const SocialConfig& S = content_->social();
  state_.social.seeded = true;
  if (!S.enabled) return;
  for (const auto& [key, rel] : state_.relationships) {
    const auto& [from, to] = key;
    if (from == to || rel.firstMetAt < 0 || !character(from) || !character(to)) continue;
    const bool close = std::all_of(S.seedFollowMin.begin(), S.seedFollowMin.end(), [&](const auto& kv) {
      const auto it = rel.dimensions.find(kv.first);
      return it != rel.dimensions.end() && it->second >= kv.second;
    });
    SocialAccountState& a = state_.social.accounts[from];
    if (close && !has(a.following, to)) a.following.push_back(to);
  }
  // Those follows are where everyone starts, not news: fame counts only followers beyond them.
  for (auto& [id, a] : state_.social.accounts) a.followersPeak = followerCount(id);
}

// ---- Hooks: what happened ---------------------------------------------------------------------
void World::socialMemory(const Memory& m, const Json& facts) {
  const SocialConfig& S = content_->social();
  if (!S.enabled || m.at < state_.now || !character(m.owner)) return;  // memories from before the world began aren't news
  const SocialMomentDef* def = S.moment(m.type);
  if (!def) return;
  SocialMoment x;
  x.memory = m.id;
  x.type = m.type;
  x.place = m.location;
  for (const auto& p : m.participants) {
    if (p != m.owner && character(p) && !has(x.with, p)) x.with.push_back(p);
  }
  if (x.with.empty() && !m.about.empty() && m.about != m.owner && character(m.about)) x.with.push_back(m.about);
  x.facts = facts.is_object() ? facts : Json::object();
  x.at = state_.now;
  const int spread = S.autoDelayMax - S.autoDelayMin + 1;
  x.postAt = state_.now + S.autoDelayMin +
             static_cast<GameMinutes>(dayhash::mix64(dayhash::fnv1a(m.owner + "|" + m.id)) % static_cast<std::uint64_t>(spread));
  x.until = state_.now + static_cast<GameMinutes>(S.autoKeepHours) * 60;
  auto& moments = state_.social.accounts[m.owner].moments;
  moments.push_back(std::move(x));
  if (moments.size() > 12) moments.erase(moments.begin());  // the oldest news goes first
}

void World::socialCheckin(const CharacterState& c, const LocationDef& place) {
  const SocialConfig& S = content_->social();
  if (!S.enabled || !isScripted(c.id) || !has(S.checkinPlaceTypes, place.type) || !S.moment("checkin")) return;
  auto& moments = state_.social.accounts[c.id].moments;
  for (const auto& m : moments) {
    if (m.type == "checkin" && m.place == place.id) return;
  }
  SocialMoment x;
  x.type = "checkin";
  x.place = place.id;
  // Who they'd tag: people here they like (their own side), at most two.
  for (const auto& id : presentWith(c)) {
    if (x.with.size() >= 2) break;
    const RelationshipState* r = relationship(c.id, id);
    if (r && r->firstMetAt >= 0 && relationshipValue(c.id, id, "friendship") >= S.checkinTagMinFriendship) x.with.push_back(id);
  }
  x.at = state_.now;
  const int spread = S.autoDelayMax - S.autoDelayMin + 1;
  x.postAt = state_.now + S.autoDelayMin +
             static_cast<GameMinutes>(dayhash::mix64(dayhash::fnv1a(c.id + "|in|" + place.id + "|" + std::to_string(state_.now))) %
                                      static_cast<std::uint64_t>(spread));
  x.until = x.postAt + 30;  // a check-in is only true while they're there (stepSocialMinute checks)
  moments.push_back(std::move(x));
  if (moments.size() > 12) moments.erase(moments.begin());
}

void World::socialPurchase(const CharacterState& c, const Offer& offer, const LocationDef& where) {
  const SocialConfig& S = content_->social();
  const ItemDef* item = content_->item(offer.item);
  if (!S.enabled || !item || S.statusMinPriceCents <= 0 || offer.priceCents < S.statusMinPriceCents) return;
  if (!has(S.statusCategories, item->category) || has(S.statusExcept, item->id)) return;
  Memory m;
  m.id = nextId("mem");
  m.owner = c.id;
  m.at = state_.now;
  m.participants = {c.id};
  m.location = where.id;
  m.type = "status_purchase";
  m.importance = 30;
  m.emotionalImpact = 20;
  m.info = "Bought " + item->label + " at " + where.name;
  addMemory(std::move(m), Json{{"item", item->label}});
}

void World::witnessed(const std::string& kind, const CharacterId& about, const CharacterId& with, const LocationId& place,
                      const std::vector<CharacterId>& witnesses, const std::string& what) {
  if (witnesses.empty()) return;
  // Some scenes only count in some places ("a kiss in a bar"), by the data.
  if (const SocialGossipKindDef* k = content_->social().gossipKind(kind); k && !k->placeTypes.empty()) {
    const LocationDef* loc = content_->location(place);
    if (!loc || !has(k->placeTypes, loc->type)) return;
  }
  Rumor r;
  r.id = nextId("rum");
  r.kind = kind;
  r.about = about;
  r.with = with;
  r.place = place;
  r.what = what;
  r.at = state_.now;
  r.until = state_.now + static_cast<GameMinutes>(content_->details().gossipHours * 60);
  r.tellers = witnesses;
  r.knows = witnesses;
  state_.details.rumors.push_back(std::move(r));
}

void World::socialInteraction(const CharacterState& actor, const CharacterState& target, const std::string& interaction) {
  const SocialConfig& S = content_->social();
  if (!S.enabled) return;
  for (const auto& k : S.gossipKinds) {
    if (!has(k.interactions, interaction)) continue;
    std::vector<CharacterId> onlookers;
    for (const auto& id : presentWith(actor, content_->sim().hearingRangeMeters)) {
      if (id != target.id) onlookers.push_back(id);
    }
    const LocationDef* at = content_->location(actor.inside);
    witnessed(k.kind, actor.id, target.id, actor.inside, onlookers,
              "had a scene with " + firstNameOf(definition(target.id), target.id) + (at ? " at " + at->name : ""));
    return;
  }
}

// ---- Writing posts ----------------------------------------------------------------------------
Result<std::string> World::publish(const std::string& author, const std::string& text, const LocationId& place,
                                   std::vector<CharacterId> tags, const std::string& topic, const std::string& about,
                                   bool automatic) {
  const SocialConfig& S = content_->social();
  SocialPost p;
  p.id = nextId("post");
  p.author = author;
  p.at = state_.now;
  p.text = text;
  p.place = content_->location(place) ? place : LocationId();
  std::erase_if(tags, [&](const CharacterId& t) { return t == author || !character(t); });
  if (static_cast<int>(tags.size()) > S.maxTags) tags.resize(static_cast<std::size_t>(S.maxTags));  // a whole team's match
  p.tags = std::move(tags);
  p.topic = topic;
  p.about = about;
  p.automatic = automatic;
  state_.social.posts.push_back(p);
  if (static_cast<int>(state_.social.posts.size()) > S.keptPosts) state_.social.posts.erase(state_.social.posts.begin());
  const bool gossip = author == S.unfilteredHandle;
  for (const auto& t : p.tags) socialNotify(t, gossip ? "gossip" : "tag", author, p.id);
  // Followers with the app open see it arrive; the post itself is what anyone can read.
  std::vector<CharacterId> told;
  for (const auto& [id, a] : state_.social.accounts) {
    const CharacterState* c = character(id);
    if (c && c->online && id != author && has(a.following, author)) told.push_back(id);
  }
  if (!told.empty()) emit(told, "post", Json{{"post", p.id}, {"author", author}});
  return p.id;
}

Result<Json> World::post(const CharacterId& actor, const std::string& text, const LocationId& place,
                         const std::vector<CharacterId>& tags, const std::string& about, const std::string& as) {
  auto r = activeCharacter(actor);
  if (!r) return r.error();
  CharacterState& c = *r.value();
  const SocialConfig& S = content_->social();
  if (!S.enabled) return fail("unavailable", "there's no social media in this world");
  if (Status st = phoneUsable(c); !st) return st.error();
  if (inJail(actor)) return fail("in_jail", "your phone is with the desk sergeant until you're out");
  const bool asGossip = !as.empty();
  if (asGossip && (as != S.unfilteredHandle || actor != S.unfilteredRunner))
    return fail("not_your_account", "you can only post as yourself");
  const std::string clean = cleanText(text);
  if (clean.empty()) return fail("invalid_text", "write something first");
  if (textLength(clean) > S.postMaxLength)
    return fail("too_long", "posts are at most " + std::to_string(S.postMaxLength) + " characters");
  if (!place.empty()) {
    const LocationDef* here = currentPlace(c);
    if (!here || here->id != place) return fail("not_there", "you can only post from where you are");
  }
  std::vector<CharacterId> tagged;
  for (const auto& t : tags) {
    if (t == actor || has(tagged, t)) continue;
    if (!character(t)) return fail("unknown_person", "there's nobody by that name");
    const RelationshipState* rel = relationship(actor, t);
    if (!rel || rel->firstMetAt < 0) return fail("not_known", "you can only tag people you know");
    tagged.push_back(t);
  }
  if (static_cast<int>(tagged.size()) > S.maxTags)
    return fail("too_many_tags", "tag at most " + std::to_string(S.maxTags) + " people");
  std::string topic;
  if (!about.empty()) {
    const auto mem = std::find_if(state_.memories.begin(), state_.memories.end(),
                                  [&](const Memory& m) { return m.id == about && m.owner == actor; });
    if (mem == state_.memories.end()) return fail("unknown_event", "that's not something that happened to you");
    if (const SocialMomentDef* d = S.moment(mem->type)) topic = d->topic;
  }
  SocialAccountState& a = socialAccount(actor);
  if (a.postsToday >= S.postsPerDay) return fail("daily_limit", "that's enough posting for one day");
  if (a.lastPostAt >= 0 && state_.now - a.lastPostAt < S.postMinGapMinutes)
    return fail("too_soon", "give it " + std::to_string(S.postMinGapMinutes - (state_.now - a.lastPostAt)) + " more minutes");
  if (a.lastPostAt >= 0 && clean == a.lastPostText && state_.now - a.lastPostAt < kMinutesPerDay)
    return fail("duplicate", "you just posted that");
  auto id = publish(asGossip ? S.unfilteredHandle : actor, clean, place, tagged, topic, asGossip ? "" : about, false);
  if (!id) return id.error();
  SocialAccountState& mine = socialAccount(actor);  // publish may have added accounts (notifications)
  mine.postsToday += 1;
  mine.lastPostAt = state_.now;
  mine.lastPostText = clean;
  if (!about.empty()) std::erase_if(mine.moments, [&](const SocialMoment& m) { return m.memory == about; });  // shared
  const SocialPost* p = findPost(id.value());
  return Json{{"post", postView(*p, c)}, {"posts_left_today", S.postsPerDay - mine.postsToday}};
}

Result<Json> World::comment(const CharacterId& actor, const std::string& postId, const std::string& text) {
  auto r = activeCharacter(actor);
  if (!r) return r.error();
  CharacterState& c = *r.value();
  const SocialConfig& S = content_->social();
  if (!S.enabled) return fail("unavailable", "there's no social media in this world");
  if (Status st = phoneUsable(c); !st) return st.error();
  if (inJail(actor)) return fail("in_jail", "your phone is with the desk sergeant until you're out");
  auto it = std::find_if(state_.social.posts.begin(), state_.social.posts.end(), [&](const SocialPost& p) { return p.id == postId; });
  if (it == state_.social.posts.end()) return fail("unknown_post", "that post isn't there any more");
  const std::string clean = cleanText(text);
  if (clean.empty()) return fail("invalid_text", "write something first");
  if (textLength(clean) > S.commentMaxLength)
    return fail("too_long", "comments are at most " + std::to_string(S.commentMaxLength) + " characters");
  if (static_cast<int>(it->comments.size()) >= S.commentsPerPost) return fail("post_full", "that post has all the comments it can take");
  SocialAccountState& a = socialAccount(actor);
  if (a.commentsToday >= S.commentsPerDay) return fail("daily_limit", "that's enough commenting for one day");
  if (a.lastCommentAt >= 0 && state_.now - a.lastCommentAt < S.commentMinGapMinutes) return fail("too_soon", "give it a moment");
  a.commentsToday += 1;
  a.lastCommentAt = state_.now;
  it->comments.push_back(SocialComment{nextId("cmt"), actor, state_.now, clean});
  const std::string author = it->author;
  const std::string pid = it->id;
  if (author != actor && character(author)) {
    for (const auto& [dim, d] : S.commentRelationship) adjustRelationship(author, actor, dim, d);
    socialNotify(author, "comment", actor, pid);
  }
  return Json{{"post", postView(*findPost(pid), c)}};
}

Result<Json> World::like(const CharacterId& actor, const std::string& postId, bool on) {
  auto r = activeCharacter(actor);
  if (!r) return r.error();
  CharacterState& c = *r.value();
  const SocialConfig& S = content_->social();
  if (!S.enabled) return fail("unavailable", "there's no social media in this world");
  if (Status st = phoneUsable(c); !st) return st.error();
  if (inJail(actor)) return fail("in_jail", "your phone is with the desk sergeant until you're out");
  auto it = std::find_if(state_.social.posts.begin(), state_.social.posts.end(), [&](const SocialPost& p) { return p.id == postId; });
  if (it == state_.social.posts.end()) return fail("unknown_post", "that post isn't there any more");
  SocialPost& p = *it;
  if (!on) {
    if (!has(p.likes, actor)) return fail("not_liked", "you haven't liked that");
    std::erase(p.likes, actor);
    return Json{{"liked", false}, {"likes", p.likes.size()}};
  }
  if (p.author == actor) return fail("own_post", "you can't like your own post");
  if (has(p.likes, actor)) return fail("already_liked", "you already like it");
  SocialAccountState& a = socialAccount(actor);
  if (a.likesToday >= S.likesPerDay) return fail("daily_limit", "that's enough likes for one day");
  a.likesToday += 1;
  p.likes.push_back(actor);
  const std::string author = p.author;
  const std::string pid = p.id;
  const bool newHigh = static_cast<int>(p.likes.size()) > p.likesPeak;
  if (newHigh) p.likesPeak = static_cast<int>(p.likes.size());
  const std::size_t count = p.likes.size();
  if (character(author)) {
    // Only a like the post never had before counts: unliking and liking again changes nothing.
    if (newHigh) {
      addSocialFame(author, S.famePerLike);
      for (const auto& [dim, d] : S.likeRelationship) adjustRelationship(author, actor, dim, d);
      socialNotify(author, "like", actor, pid);
    }
  }
  return Json{{"liked", true}, {"likes", count}};
}

Result<Json> World::follow(const CharacterId& actor, const std::string& account, bool on) {
  auto r = activeCharacter(actor);
  if (!r) return r.error();
  CharacterState& c = *r.value();
  const SocialConfig& S = content_->social();
  if (!S.enabled) return fail("unavailable", "there's no social media in this world");
  if (Status st = phoneUsable(c); !st) return st.error();
  if (inJail(actor)) return fail("in_jail", "your phone is with the desk sergeant until you're out");
  if (!socialAccountExists(account)) return fail("unknown_account", "there's no such account");
  if (account == actor) return fail("invalid_target", "you can't follow yourself");
  SocialAccountState& a = socialAccount(actor);
  if (!on) {
    if (!has(a.following, account)) return fail("not_following", "you don't follow them");
    std::erase(a.following, account);
    return Json{{"following", false}, {"followers", followerCount(account)}};
  }
  if (has(a.following, account)) return fail("already_following", "you already follow them");
  if (static_cast<int>(a.following.size()) >= S.maxFollowing)
    return fail("too_many", "you follow " + std::to_string(S.maxFollowing) + " accounts already");
  a.following.push_back(account);
  const int followers = followerCount(account);
  if (character(account)) {
    SocialAccountState& them = socialAccount(account);
    if (followers > them.followersPeak) {  // a follower they never had: unfollowing and following again isn't news
      them.followersPeak = followers;
      addSocialFame(account, S.famePerFollower);
      for (const auto& [dim, d] : S.followRelationship) adjustRelationship(account, actor, dim, d);
      socialNotify(account, "follow", actor, "");
    }
  }
  return Json{{"following", true}, {"followers", followers}};
}

void World::addSocialFame(const CharacterId& id, double amount) {
  CharacterState* c = mutableCharacter(id);
  if (!c || amount <= 0) return;
  SocialAccountState& a = socialAccount(id);
  const double room = content_->social().fameMaxPerDay - a.fameToday;
  if (room <= 0) return;
  const double add = std::min(amount, room);
  a.fameToday += add;
  addFame(*c, add);
}

void World::socialNotify(const CharacterId& to, const std::string& kind, const std::string& from, const std::string& post) {
  const SocialConfig& S = content_->social();
  if (to == from || !character(to)) return;
  SocialAccountState& a = socialAccount(to);
  // Likes on one post within the hour are one entry, and one toast.
  if (kind == "like") {
    for (auto it = a.activity.rbegin(); it != a.activity.rend(); ++it) {
      if (it->kind == "like" && it->post == post && !it->seen && state_.now - it->at < 60) {
        it->count += 1;
        it->from = from;
        it->at = state_.now;
        return;
      }
    }
  }
  a.activity.push_back(SocialActivity{kind, from, post, state_.now, false, 1});
  if (static_cast<int>(a.activity.size()) > S.activityKept) a.activity.erase(a.activity.begin());
  const CharacterState* c = character(to);
  if (!c || !c->online) return;
  const std::int64_t hour = state_.now / 60;
  if (a.notifyHour != hour) {
    a.notifyHour = hour;
    a.notified = 0;
  }
  if (a.notified >= S.notifyPerHour) return;  // the rest wait in the app's activity list
  a.notified += 1;
  const bool gossip = from == S.unfilteredHandle;
  const CharacterDef* d = definition(from);
  const std::string who = gossip ? "@" + S.unfilteredHandle : firstNameOf(d, from);
  std::string text;
  if (kind == "like") text = who + " liked your post.";
  else if (kind == "comment") text = who + " commented on your post.";
  else if (kind == "follow") text = who + " followed you.";
  else if (kind == "tag") text = who + " tagged you in a post.";
  else if (kind == "gossip") text = who + " posted about you.";
  else text = who + ".";
  emit({to}, "social", Json{{"kind", kind}, {"from", from}, {"from_name", gossip ? S.unfilteredName : (d ? d->fullName() : from)},
                            {"post", post}, {"text", text}, {"at", state_.now}});
}

// ---- The game posts: moments of people a script plays, and the gossip account ------------------
std::string World::momentLine(const CharacterId& author, const SocialMoment& m, const SocialMomentDef& def) const {
  const CharacterDef* d = definition(author);
  std::string voice = "default";
  if (d) {
    for (const auto& v : content_->social().voices) {
      const auto meets = [&](const StatMap& bound, bool atLeast) {
        return std::all_of(bound.begin(), bound.end(), [&](const auto& kv) {
          const auto it = d->personality.find(kv.first);
          const double t = it == d->personality.end() ? 50 : it->second;
          return atLeast ? t >= kv.second : t <= kv.second;
        });
      };
      if (meets(v.min, true) && meets(v.max, false)) {
        voice = v.id;
        break;
      }
    }
  }
  std::map<std::string, std::string> values{{"first", firstNameOf(d, author)}};
  if (const LocationDef* loc = content_->location(m.place)) values["place"] = loc->name;
  if (!m.with.empty()) values["with"] = firstNameOf(definition(m.with.front()), m.with.front());
  for (const char* k : {"title", "pet", "item"}) {
    if (m.facts.contains(k) && m.facts[k].is_string()) values[k] = m.facts[k].get<std::string>();
  }
  const std::string key = author + "|" + m.memory + "|" + m.type + "|" + std::to_string(m.at);
  const auto own = def.lines.find(voice);
  std::string out = own == def.lines.end() ? "" : pickLine(own->second, values, key);
  if (out.empty()) out = pickLine(def.lines.at("default"), values, key);
  return out;
}

void World::stepSocialMinute() {
  const SocialConfig& S = content_->social();
  if (!S.enabled) return;
  for (auto& [id, acct] : state_.social.accounts) {
    if (acct.moments.empty()) continue;
    std::erase_if(acct.moments, [&](const SocialMoment& m) { return state_.now > m.until; });
    // Only someone a script plays posts on their own; for a person they're something they might share.
    const CharacterState* c = character(id);
    if (!c || !c->online || c->asleepSince >= 0 || !isScripted(id) || inJail(id) || !phoneUsable(*c)) continue;
    SocialAccountState& a = socialAccount(id);
    for (auto it = a.moments.begin(); it != a.moments.end(); ++it) {
      if (state_.now < it->postAt) continue;
      const SocialMomentDef* def = S.moment(it->type);
      const CharacterDef* d = definition(id);
      double trait = 50;
      if (d && !S.autoTrait.empty()) {
        const auto t = d->personality.find(S.autoTrait);
        if (t != d->personality.end()) trait = t->second;
      }
      const double chance = def ? def->chance * std::clamp(S.autoBase + S.autoPerTrait * trait / 100, 0.0, 1.0) : 0;
      const bool stillThere = it->type != "checkin" || c->inside == it->place;
      if (!def || !stillThere || unit("auto|" + id + "|" + it->memory + "|" + it->type + "|" + std::to_string(it->at)) >= chance) {
        a.moments.erase(it);
        break;  // one change a minute; the rest wait
      }
      if (a.autoToday >= S.autoPerDay || (a.lastAutoAt >= 0 && state_.now - a.lastAutoAt < S.autoMinGapMinutes)) break;
      const std::string text = momentLine(id, *it, *def);
      const SocialMoment m = *it;
      a.moments.erase(it);
      if (text.empty()) break;
      a.autoToday += 1;
      a.lastAutoAt = state_.now;
      (void)publish(id, text, m.place, m.with, def->topic, m.memory, true);
      break;
    }
  }

  // The gossip account: a scene enough people know about, once the delay has passed.
  if (S.gossipKinds.empty() || S.unfilteredHandle.empty()) return;
  const std::int64_t today = state_.now / kMinutesPerDay;
  if (state_.social.gossipDay != today) {
    state_.social.gossipDay = today;
    state_.social.gossipToday = 0;
  }
  for (std::size_t i = 0; i < state_.details.rumors.size(); ++i) {
    Rumor& r = state_.details.rumors[i];
    if (r.id.empty() || !r.post.empty()) continue;
    const SocialGossipKindDef* kind = S.gossipKind(r.kind);
    if (!kind || state_.now > r.until) {
      r.post = "-";
      continue;
    }
    if (state_.now < r.at + S.unfilteredDelayMinutes || static_cast<int>(r.knows.size()) < S.unfilteredMinHeard) continue;
    if (state_.social.gossipToday >= S.unfilteredPerDay) break;  // tomorrow, if it's still news
    if (unit("gossip|" + r.id) >= kind->chance) {
      r.post = "-";
      continue;
    }
    const bool twisted = !kind->twisted.empty() && unit("twist|" + r.id) < S.unfilteredTwistChance;
    std::map<std::string, std::string> values{{"about", firstNameOf(definition(r.about), r.about)}};
    if (!r.with.empty()) values["with"] = firstNameOf(definition(r.with), r.with);
    LocationId place = r.place;
    if (const LocationDef* loc = content_->location(r.place)) {
      values["place"] = loc->name;
    } else if (const CharacterState* who = character(r.about)) {
      // Out on the street: the corner by the nearest place, which also gives the post its picture.
      const LocationDef* near = nullptr;
      for (const auto& [lid, l] : content_->locations()) {
        if (!near || distance(who->position, l.door) < distance(who->position, near->door)) near = &l;
      }
      if (near && distance(who->position, near->door) <= 150) {
        values["place"] = "the corner by " + near->name;
        place = near->id;
      }
    }
    std::string text = pickLine(twisted ? kind->twisted : kind->lines, values, r.id);
    if (text.empty() && twisted) text = pickLine(kind->lines, values, r.id);
    if (text.empty()) {
      r.post = "-";
      continue;
    }
    const bool truthful = !twisted || text == pickLine(kind->lines, values, r.id);
    std::vector<CharacterId> tags{r.about};
    if (!r.with.empty()) tags.push_back(r.with);
    std::vector<CharacterId> there = r.tellers;
    for (const auto& t : tags) {
      if (!has(there, t)) there.push_back(t);
    }
    // publish may grow the accounts map but never the rumours, so `r` stays valid; copy what it needs first.
    const std::string rid = r.id;
    const std::vector<CharacterId> knows = r.knows;
    auto id = publish(S.unfilteredHandle, text, place, tags, kind->topic, rid, true);
    if (!id) continue;
    state_.details.rumors[i].post = id.value();
    state_.social.gossipToday += 1;
    SocialPost& p = state_.social.posts.back();
    p.heardBy = knows;
    p.there = std::move(there);
    p.truthful = truthful;
  }
}

void World::stepSocialHourly() {
  const SocialConfig& S = content_->social();
  if (!S.enabled || S.unfilteredHandle.empty()) return;
  std::map<std::string, const Rumor*> byId;
  for (const auto& r : state_.details.rumors) {
    if (!r.id.empty()) byId[r.id] = &r;
  }
  for (auto& p : state_.social.posts) {
    if (p.author != S.unfilteredHandle || p.about.empty()) continue;
    const auto it = byId.find(p.about);
    if (it != byId.end() && it->second->knows.size() > p.heardBy.size()) p.heardBy = it->second->knows;
  }
}

// ---- What a person may see ---------------------------------------------------------------------
bool World::feedHas(const CharacterState& viewer, const SocialPost& p) const {
  if (p.author == viewer.id || follows(viewer.id, p.author) || has(p.tags, viewer.id)) return true;
  // Gossip that reached you: you were there, or someone told you.
  return p.author == content_->social().unfilteredHandle && (has(p.heardBy, viewer.id) || has(p.there, viewer.id));
}

Json World::accountView(const std::string& account, const CharacterState& viewer) const {
  const SocialConfig& S = content_->social();
  int posts = 0;
  for (const auto& p : state_.social.posts) posts += p.author == account ? 1 : 0;
  auto acct = state_.social.accounts.find(account);
  Json out{{"account", account},
           {"handle", socialHandleOf(account)},
           {"followers", followerCount(account)},
           {"following", acct == state_.social.accounts.end() ? 0 : acct->second.following.size()},
           {"posts", posts},
           {"you_follow", follows(viewer.id, account)},
           {"follows_you", follows(account, viewer.id)},
           {"you", account == viewer.id}};
  if (account == S.unfilteredHandle) {
    out["name"] = S.unfilteredName;
    out["bio"] = S.unfilteredBio;
    out["gossip"] = true;
    out["following"] = 0;  // an anonymous account follows nobody anyone can see
    if (viewer.id == S.unfilteredRunner) out["you_run_it"] = true;  // your secret: nobody else is ever told
    return out;
  }
  const CharacterDef* d = definition(account);
  out["name"] = d ? d->fullName() : account;
  std::string bio;
  if (d && d->profile.is_object()) {
    const Json sm = d->profile.value("social_media", Json::object());
    if (sm.is_object() && sm.contains("bio") && sm["bio"].is_string()) bio = sm["bio"].get<std::string>();
    if (bio.empty() && d->profile.contains("tagline") && d->profile["tagline"].is_string()) bio = d->profile["tagline"].get<std::string>();
  }
  out["bio"] = bio;
  const RelationshipState* rel = relationship(viewer.id, account);
  out["known"] = account == viewer.id || (rel && rel->firstMetAt >= 0);
  out["scripted"] = isScripted(account);
  if (isScripted(account)) out["played_by"] = playedBy(account);
  if (const std::string tier = fameTierOf(account); !tier.empty()) out["fame_tier"] = tier;
  return out;
}

Json World::postView(const SocialPost& p, const CharacterState& viewer) const {
  const SocialConfig& S = content_->social();
  const bool gossip = p.author == S.unfilteredHandle;
  Json author{{"account", p.author}, {"handle", socialHandleOf(p.author)}};
  if (gossip) {
    author["name"] = S.unfilteredName;
    author["gossip"] = true;
  } else {
    const CharacterDef* d = definition(p.author);
    author["name"] = d ? d->fullName() : p.author;
    author["scripted"] = isScripted(p.author);
    if (isScripted(p.author)) author["played_by"] = playedBy(p.author);
  }
  Json tags = Json::array();
  for (const auto& t : p.tags) {
    const CharacterDef* d = definition(t);
    tags.push_back(Json{{"account", t}, {"name", d ? d->fullName() : t}});
  }
  Json place;
  if (const LocationDef* loc = content_->location(p.place))
    place = Json{{"id", loc->id}, {"name", loc->name}, {"type", loc->type}};
  Json comments = Json::array();
  const std::size_t shown = static_cast<std::size_t>(S.commentsShown);
  const std::size_t from = p.comments.size() > shown ? p.comments.size() - shown : 0;
  for (std::size_t i = from; i < p.comments.size(); ++i) {
    const SocialComment& k = p.comments[i];
    const CharacterDef* d = definition(k.author);
    comments.push_back(Json{{"comment", k.id}, {"account", k.author}, {"name", d ? d->fullName() : k.author},
                            {"text", k.text}, {"at", k.at}, {"when", formatDateTime(k.at)}, {"mine", k.author == viewer.id}});
  }
  Json out{{"post", p.id},
           {"author", author},
           {"at", p.at},
           {"when", formatDateTime(p.at)},
           {"text", p.text},
           {"place", place},
           {"tags", tags},
           {"topic", p.topic},
           {"topic_label", S.topics.count(p.topic) ? S.topics.at(p.topic) : ""},
           {"automatic", p.automatic},
           {"likes", p.likes.size()},
           {"liked", has(p.likes, viewer.id)},
           {"comments", p.comments.size()},
           {"recent_comments", comments},
           {"mine", p.author == viewer.id}};
  if (gossip && !p.about.empty()) {
    // How many know is public; who they are isn't. Whether it's true only the people who were there can say.
    const bool there = has(p.there, viewer.id);
    Json g{{"heard_by", p.heardBy.size()}, {"you_were_there", there}, {"you_heard", has(p.heardBy, viewer.id)}};
    g["true"] = there ? Json(p.truthful) : Json();
    out["gossip"] = g;
  }
  return out;
}

Result<Json> World::socialFeed(const CharacterId& actor, const std::string& tab) const {
  const CharacterState* c = character(actor);
  if (!c || !c->online) return fail("not_in_world", "character is not in the world");
  const SocialConfig& S = content_->social();
  if (!S.enabled) return fail("unavailable", "there's no social media in this world");
  if (Status st = phoneUsable(*c); !st) return st.error();
  if (tab != "following" && tab != "town") return fail("bad_tab", "tab is following or town");
  Json posts = Json::array();
  for (auto it = state_.social.posts.rbegin(); it != state_.social.posts.rend(); ++it) {
    if (static_cast<int>(posts.size()) >= S.feedLimit) break;
    if (tab == "following" && !feedHas(*c, *it)) continue;
    posts.push_back(postView(*it, *c));
  }
  return Json{{"tab", tab}, {"posts", posts}};
}

Result<Json> World::socialProfile(const CharacterId& actor, const std::string& account) const {
  const CharacterState* c = character(actor);
  if (!c || !c->online) return fail("not_in_world", "character is not in the world");
  const SocialConfig& S = content_->social();
  if (!S.enabled) return fail("unavailable", "there's no social media in this world");
  if (Status st = phoneUsable(*c); !st) return st.error();
  if (!socialAccountExists(account)) return fail("unknown_account", "there's no such account");
  Json posts = Json::array();
  for (auto it = state_.social.posts.rbegin(); it != state_.social.posts.rend(); ++it) {
    if (static_cast<int>(posts.size()) >= S.feedLimit) break;
    if (it->author == account) posts.push_back(postView(*it, *c));
  }
  return Json{{"account", accountView(account, *c)}, {"posts", posts}};
}

Json World::phoneSocial(const CharacterState& c) {
  const SocialConfig& S = content_->social();
  if (!S.enabled) return Json{{"enabled", false}};
  Json feed = Json::array();
  for (auto it = state_.social.posts.rbegin(); it != state_.social.posts.rend(); ++it) {
    if (static_cast<int>(feed.size()) >= S.feedLimit) break;
    if (feedHas(c, *it)) feed.push_back(postView(*it, c));
  }
  SocialAccountState& a = socialAccount(c.id);
  Json activity = Json::array();
  int unseen = 0;
  for (auto it = a.activity.rbegin(); it != a.activity.rend(); ++it) {
    const bool gossip = it->from == S.unfilteredHandle;
    const CharacterDef* d = definition(it->from);
    activity.push_back(Json{{"kind", it->kind},
                            {"from", Json{{"account", it->from}, {"name", gossip ? S.unfilteredName : (d ? d->fullName() : it->from)},
                                          {"handle", socialHandleOf(it->from)}, {"gossip", gossip}}},
                            {"post", it->post},
                            {"count", it->count},
                            {"at", it->at},
                            {"when", formatDateTime(it->at)},
                            {"new", !it->seen}});
    unseen += it->seen ? 0 : 1;
    it->seen = true;
  }
  // Things that happened to you that you could share: your own memories, offered with a line in your voice.
  Json share = Json::array();
  for (const auto& m : a.moments) {
    if (m.memory.empty() || state_.now > m.until) continue;
    const SocialMomentDef* def = S.moment(m.type);
    if (!def) continue;
    Json tags = Json::array();
    for (const auto& t : m.with) {
      const RelationshipState* rel = relationship(c.id, t);
      const CharacterDef* d = definition(t);
      if (rel && rel->firstMetAt >= 0) tags.push_back(Json{{"account", t}, {"name", d ? d->fullName() : t}});
    }
    const LocationDef* loc = content_->location(m.place);
    share.push_back(Json{{"about", m.memory}, {"topic", def->topic}, {"topic_label", S.topics.count(def->topic) ? S.topics.at(def->topic) : ""},
                         {"text", momentLine(c.id, m, *def)}, {"tags", tags},
                         {"place", loc ? Json{{"id", loc->id}, {"name", loc->name}} : Json()},
                         {"here", loc && currentPlace(c) == loc}});
  }
  // People you know and don't follow yet.
  Json suggest = Json::array();
  for (const auto& [key, rel] : state_.relationships) {
    if (key.first != c.id || key.second == c.id || rel.firstMetAt < 0 || !character(key.second)) continue;
    if (follows(c.id, key.second) || suggest.size() >= 8) continue;
    suggest.push_back(accountView(key.second, c));
  }
  Json out{{"you", accountView(c.id, c)},
           {"feed", feed},
           {"activity", activity},
           {"new_activity", unseen},
           {"share", share},
           {"suggested", suggest},
           {"limits", Json{{"post_max_length", S.postMaxLength}, {"comment_max_length", S.commentMaxLength},
                           {"max_tags", S.maxTags}, {"posts_left_today", S.postsPerDay - a.postsToday}}}};
  if (!S.unfilteredHandle.empty()) out["gossip_account"] = accountView(S.unfilteredHandle, c);
  return out;
}

Json World::phoneMapPeople(const CharacterState& c) const {
  const SocialConfig& S = content_->social();
  Json people = Json::array();
  for (const auto& [key, rel] : state_.relationships) {
    if (key.first != c.id || key.second == c.id || rel.firstMetAt < 0) continue;
    const CharacterState* o = character(key.second);
    const CharacterDef* d = definition(key.second);
    if (!o || !d) continue;
    Json p{{"character", key.second}, {"name", d->fullName()}, {"scripted", isScripted(key.second)}};
    if (isScripted(key.second)) p["played_by"] = playedBy(key.second);
    if (inSight(c, *o)) {
      // What you can see: where they are, by the same rule as the map (outdoors in sight, or in the same building).
      p["where"] = "in_sight";
      p["inside"] = o->inside;
      p["position"] = Json::array({std::round(o->position.x * 10) / 10, std::round(o->position.y * 10) / 10});
    } else {
      // What they told everyone: the latest post they made from somewhere.
      const SocialPost* last = nullptr;
      for (const auto& post : state_.social.posts) {
        if (post.author == key.second && !post.place.empty() && post.at >= state_.now - S.mapPostHours * 60) last = &post;
      }
      if (last) {
        const LocationDef* loc = content_->location(last->place);
        p["where"] = "posted";
        p["place"] = Json{{"id", loc->id}, {"name", loc->name}};
        p["at"] = last->at;
        p["when"] = formatDateTime(last->at);
      } else {
        p["where"] = "unknown";
      }
    }
    people.push_back(std::move(p));
  }
  return people;
}

// ---- Save ----------------------------------------------------------------------------------
Json socialPartToJson(const WorldState& s) {
  const SocialWorldState& W = s.social;
  Json posts = Json::array();
  for (const auto& p : W.posts) {
    Json comments = Json::array();
    for (const auto& k : p.comments) comments.push_back(Json{{"id", k.id}, {"author", k.author}, {"at", k.at}, {"text", k.text}});
    posts.push_back(Json{{"id", p.id}, {"author", p.author}, {"at", p.at}, {"text", p.text}, {"place", p.place}, {"tags", p.tags},
                         {"topic", p.topic}, {"about", p.about}, {"automatic", p.automatic}, {"likes", p.likes},
                         {"likes_peak", p.likesPeak}, {"comments", comments}, {"heard_by", p.heardBy}, {"there", p.there},
                         {"truthful", p.truthful}});
  }
  Json accounts = Json::object();
  for (const auto& [id, a] : W.accounts) {
    Json moments = Json::array();
    for (const auto& m : a.moments)
      moments.push_back(Json{{"memory", m.memory}, {"type", m.type}, {"place", m.place}, {"with", m.with}, {"facts", m.facts},
                             {"at", m.at}, {"post_at", m.postAt}, {"until", m.until}});
    Json activity = Json::array();
    for (const auto& x : a.activity)
      activity.push_back(Json{{"kind", x.kind}, {"from", x.from}, {"post", x.post}, {"at", x.at}, {"seen", x.seen}, {"count", x.count}});
    accounts[id] = Json{{"following", a.following}, {"followers_peak", a.followersPeak}, {"moments", moments}, {"activity", activity},
                        {"day", a.day}, {"posts_today", a.postsToday}, {"comments_today", a.commentsToday},
                        {"likes_today", a.likesToday}, {"auto_today", a.autoToday}, {"fame_today", a.fameToday},
                        {"last_post_at", a.lastPostAt}, {"last_comment_at", a.lastCommentAt}, {"last_auto_at", a.lastAutoAt},
                        {"last_post_text", a.lastPostText}};
  }
  return Json{{"seeded", W.seeded}, {"posts", posts}, {"accounts", accounts}, {"gossip_day", W.gossipDay},
              {"gossip_today", W.gossipToday}};
}

// A save without the part (from before social media) loads with no posts and seeded false: the World's constructor
// then makes the founding follows.
void socialPartFromJson(WorldState& s, const Json& j) {
  SocialWorldState& W = s.social;
  W = SocialWorldState{};
  if (!j.is_object()) return;
  W.seeded = j.value("seeded", false);
  W.gossipDay = j.value("gossip_day", std::int64_t{-1});
  W.gossipToday = j.value("gossip_today", 0);
  for (const auto& p : j.value("posts", Json::array())) {
    SocialPost x;
    x.id = p.value("id", "");
    x.author = p.value("author", "");
    x.at = p.value("at", GameMinutes{0});
    x.text = p.value("text", "");
    x.place = p.value("place", "");
    x.tags = p.value("tags", std::vector<std::string>{});
    x.topic = p.value("topic", "");
    x.about = p.value("about", "");
    x.automatic = p.value("automatic", false);
    x.likes = p.value("likes", std::vector<std::string>{});
    x.likesPeak = p.value("likes_peak", static_cast<int>(x.likes.size()));
    for (const auto& k : p.value("comments", Json::array()))
      x.comments.push_back(SocialComment{k.value("id", ""), k.value("author", ""), k.value("at", GameMinutes{0}), k.value("text", "")});
    x.heardBy = p.value("heard_by", std::vector<std::string>{});
    x.there = p.value("there", std::vector<std::string>{});
    x.truthful = p.value("truthful", true);
    if (!x.id.empty() && !x.author.empty()) W.posts.push_back(std::move(x));
  }
  const Json accounts = j.value("accounts", Json::object());
  for (const auto& [id, a] : accounts.items()) {
    SocialAccountState x;
    x.following = a.value("following", std::vector<std::string>{});
    x.followersPeak = a.value("followers_peak", 0);
    for (const auto& m : a.value("moments", Json::array())) {
      SocialMoment y;
      y.memory = m.value("memory", "");
      y.type = m.value("type", "");
      y.place = m.value("place", "");
      y.with = m.value("with", std::vector<std::string>{});
      y.facts = m.value("facts", Json::object());
      y.at = m.value("at", GameMinutes{0});
      y.postAt = m.value("post_at", GameMinutes{0});
      y.until = m.value("until", GameMinutes{0});
      if (!y.type.empty()) x.moments.push_back(std::move(y));
    }
    for (const auto& v : a.value("activity", Json::array()))
      x.activity.push_back(SocialActivity{v.value("kind", ""), v.value("from", ""), v.value("post", ""), v.value("at", GameMinutes{0}),
                                          v.value("seen", false), v.value("count", 1)});
    x.day = a.value("day", std::int64_t{-1});
    x.postsToday = a.value("posts_today", 0);
    x.commentsToday = a.value("comments_today", 0);
    x.likesToday = a.value("likes_today", 0);
    x.autoToday = a.value("auto_today", 0);
    x.fameToday = a.value("fame_today", 0.0);
    x.lastPostAt = a.value("last_post_at", GameMinutes{-1});
    x.lastCommentAt = a.value("last_comment_at", GameMinutes{-1});
    x.lastAutoAt = a.value("last_auto_at", GameMinutes{-1});
    x.lastPostText = a.value("last_post_text", "");
    W.accounts[id] = std::move(x);
  }
}

}  // namespace livera
