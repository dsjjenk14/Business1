// Social media (D-074, core/Social.cpp): posts are World state built from real events. Every op and its refusals,
// the founding follows, fame and relationships from followers and likes, notifications within their limit, the
// privacy rule (a feed never holds what that character couldn't know), posts written by the game only from what
// really happened to someone a script plays, gossip only from witnessed scenes, the map app's people, the messages'
// seen state and the autopilot's replies, and the save.
#include <cmath>
#include <optional>

#include "TestSupport.h"
#include "core/Autopilot.h"
#include "core/Clock.h"
#include "core/Parts.h"
#include "core/Serialization.h"
#include "persistence/SqliteStore.h"

using namespace livera;
using namespace livera::test;

namespace {

bool contains(const std::string& s, const std::string& part) { return s.find(part) != std::string::npos; }
bool has(const std::vector<std::string>& v, const std::string& x) { return std::find(v.begin(), v.end(), x) != v.end(); }
bool near(double a, double b) { return std::abs(a - b) < 1e-6; }

// Social media with no luck in it: every moment and every scene is posted, five minutes on, and nothing is twisted;
// gossip spreads within the hour to friends of 40 and more. `tweak` changes the social section further.
std::shared_ptr<const ContentDatabase> socialContent(const std::function<void(Json& social)>& tweak = {},
                                                     const std::function<void(Json& doc, const std::string& file)>& more = {}) {
  return patchedContent([&](Json& doc, const std::string& file) {
    if (file == "social.json" && doc.contains("social")) {  // not interactions/social.json
      Json& s = doc["social"];
      s["auto"]["base"] = 1.0;
      s["auto"]["per_trait"] = 0.0;
      s["auto"]["delay_minutes"] = Json::array({5, 5});
      for (auto& m : s["auto"]["moments"]) m["chance"] = 1.0;
      s["unfiltered"]["twist_chance"] = 0.0;
      for (auto& k : s["unfiltered"]["kinds"]) k["chance"] = 1.0;
      if (tweak) tweak(s);
    }
    if (file == "details.json") {
      doc["details"]["accident"]["gossip"]["chance_per_hour"] = 1.0;
      doc["details"]["accident"]["gossip"]["min_friendship"] = 40;
    }
    if (file == "conditions.json") {
      for (auto& c : doc["conditions"]) {
        if (c.contains("catch")) c["catch"] = Json{{"hourly_chance", 0.0}};
      }
    }
    if (file == "life_events.json") doc["life_events"]["per_day"] = 1;  // keep events out of the way
    if (more) more(doc, file);
  });
}

World socialWorld(std::shared_ptr<const ContentDatabase> db, std::initializer_list<const char*> who) {
  World w = World::createNew(std::move(db));
  for (const char* id : who) REQUIRE(w.connect(id));
  w.advanceMinutes(3 * 60);  // Monday 10:00
  (void)w.drainEvents();
  return w;
}

std::vector<Json> eventsOf(const std::vector<WorldEvent>& evs, const CharacterId& to, const std::string& type) {
  std::vector<Json> out;
  for (const auto& e : evs) {
    if (e.type == type && std::find(e.recipients.begin(), e.recipients.end(), to) != e.recipients.end()) out.push_back(e.data);
  }
  return out;
}

std::vector<const SocialPost*> postsBy(const World& w, const std::string& author, const std::string& topic = "") {
  std::vector<const SocialPost*> out;
  for (const auto& p : w.state().social.posts) {
    if (p.author == author && (topic.empty() || p.topic == topic)) out.push_back(&p);
  }
  return out;
}

std::string lastPostId(const World& w) { return w.state().social.posts.back().id; }

Json feed(const World& w, const CharacterId& who, const std::string& tab) {
  auto r = w.socialFeed(who, tab);
  if (!r) throw std::runtime_error("feed refused: " + r.error().code);
  return r.value()["posts"];
}

bool feedHasPost(const Json& posts, const std::string& id) {
  return std::any_of(posts.begin(), posts.end(), [&](const Json& p) { return p["post"] == id; });
}

std::optional<Json> findIn(const Json& posts, const std::string& id) {  // a copy: feeds are temporaries
  for (const auto& p : posts) {
    if (p["post"] == id) return p;
  }
  return std::nullopt;
}

const Memory* memoryOf(const World& w, const CharacterId& owner, const std::string& type) {
  const Memory* found = nullptr;
  for (const auto& m : w.state().memories) {
    if (m.owner == owner && m.type == type) found = &m;
  }
  return found;
}

bool refusedContent(const std::string& onFile, const std::function<void(Json& doc)>& edit, const std::string& needle) {
  try {
    (void)patchedContent([&](Json& doc, const std::string& file) {
      // Two files are called social.json (interactions/ and society/): the one with the section.
      if (file == onFile && (file != "social.json" || doc.contains("social"))) edit(doc);
    });
  } catch (const std::exception& e) {
    if (contains(e.what(), needle)) return true;
    std::fprintf(stderr, "    refused, but with: %s\n", e.what());
    return false;
  }
  return false;
}

}  // namespace

// ---- Content -------------------------------------------------------------------------------------
TEST_CASE("social: the data: the gossip account is Sienna's secret, and broken social data is refused") {
  const SocialConfig& S = realContent()->social();
  CHECK(S.enabled);
  CHECK(S.unfilteredHandle == "livera.unfiltered");
  CHECK(S.unfilteredRunner == "sienna");  // from the secret in her data, not from code
  CHECK(S.moment("promotion") != nullptr);
  CHECK(S.moment("checkin") != nullptr);
  CHECK(S.gossipKind("fight") != nullptr);
  CHECK(S.gossipKind("kiss") != nullptr && !S.gossipKind("kiss")->placeTypes.empty());
  auto social = [](const std::function<void(Json& s)>& f) { return [f](Json& doc) { f(doc["social"]); }; };
  CHECK(refusedContent("social.json", social([](Json& s) { s["auto"]["moments"][0]["lines"]["default"] = {"Hi {nobody}"}; }),
                       "unknown placeholder {nobody}"));
  CHECK(refusedContent("social.json", social([](Json& s) { s["auto"]["moments"][0]["topic"] = "space"; }), "unknown topic"));
  CHECK(refusedContent("social.json", social([](Json& s) { s["auto"]["moments"][0]["lines"]["shouty"] = {"Hi"}; }),
                       "unknown voice 'shouty'"));
  CHECK(refusedContent("social.json", social([](Json& s) { s["auto"]["moments"][0]["lines"].erase("default"); }),
                       "needs 'default' lines"));
  CHECK(refusedContent("social.json", social([](Json& s) { s["unfiltered"]["run_by_secret"] = "nobody_knows"; }),
                       "no character has the secret"));
  CHECK(refusedContent("social.json", social([](Json& s) { s["auto"]["checkin_place_types"] = {"moon_base"}; }),
                       "no place is a 'moon_base'"));
  CHECK(refusedContent("social.json", social([](Json& s) { s["unfiltered"]["kinds"][1]["interactions"] = {"telepathy"}; }),
                       "unknown interaction 'telepathy'"));
  CHECK(refusedContent("social.json", social([](Json& s) { s["unfiltered"]["kinds"][0]["kind"] = "duel"; }),
                       "the World reports no such scene"));
  CHECK(refusedContent("social.json", social([](Json& s) { s["relationship"]["like"] = {{"awe", 1}}; }),
                       "unknown relationship dimension 'awe'"));
  CHECK(refusedContent("social.json", social([](Json& s) { s["spam"] = 1; }), "unknown key 'spam'"));
  CHECK(refusedContent("social.json", social([](Json& s) { s["unfiltered"]["handle"] = "dax"; }), "a handle with a dot"));
  CHECK(refusedContent("social.json", social([](Json& s) { s["auto"]["voices"][0]["min"] = {{"charisma", 50}}; }),
                       "unknown trait 'charisma'"));
  CHECK(refusedContent("manners.json",
                       [](Json& doc) { doc["autopilot_manners"]["messages"]["replies"][0]["min"] = {{"awe", 1}}; },
                       "unknown dimension 'awe'"));
  CHECK(refusedContent("manners.json", [](Json& doc) { doc["autopilot_manners"]["messages"]["replies"][0]["lines"] = Json::array(); },
                       "a reply rule has no lines"));
}

TEST_CASE("social: a new world: people follow who they already know, and that is nobody's fame") {
  World w = World::createNew(realContent());
  CHECK(w.state().social.seeded);
  const auto& f = w.state().social.accounts.at("dominique").following;
  CHECK(has(f, "aaliyah"));   // familiarity 78
  CHECK(!has(f, "leila"));    // 15: they've met, not more
  CHECK(!has(f, "livera.unfiltered"));
  for (const auto& [id, def] : w.content().characters()) CHECK(near(w.character(id)->fame, def.fame));
  // A save from before social media loads with the same founding follows.
  Json j = worldStateToJson(w.state());
  j["world_parts"].erase("social");
  auto old = worldStateFromJson(j);
  REQUIRE(old);
  World loaded(w.contentPtr(), std::move(old).value());
  CHECK(loaded.state().social.seeded);
  CHECK(has(loaded.state().social.accounts.at("dominique").following, "aaliyah"));
  CHECK(loaded.state().social.posts.empty());
}

// ---- The ops -------------------------------------------------------------------------------------
TEST_CASE("social: post: text, the place you're at, people you know; and every refusal") {
  World w = socialWorld(socialContent([](Json& s) {
                          s["post"]["per_day"] = 3;
                          s["post"]["max_tags"] = 1;
                          s["post"]["min_gap_minutes"] = 10;
                        }),
                        {"dominique", "dax"});
  walkInto(w, "dominique", "heritage_coffee");
  walkInto(w, "dax", "heritage_coffee");
  (void)w.drainEvents();
  auto r = w.post("dominique", "  Coffee with the best engineer in town  ", "heritage_coffee", {"dax"}, "");
  REQUIRE(r);
  const Json p = r.value()["post"];
  CHECK(p["text"] == "Coffee with the best engineer in town");
  CHECK(p["place"]["id"] == "heritage_coffee");
  CHECK(p["tags"].size() == 1);
  CHECK(p["tags"][0]["account"] == "dax");
  CHECK(p["author"]["account"] == "dominique");
  CHECK(p["author"]["handle"] == "dom.ashford");  // from her data
  CHECK(p["automatic"] == false);
  CHECK(p["mine"] == true);
  CHECK(r.value()["posts_left_today"] == 2);
  const auto told = eventsOf(w.drainEvents(), "dax", "social");
  REQUIRE(told.size() == 1);
  CHECK(told[0]["kind"] == "tag");

  CHECK(w.post("dominique", "Again", "", {}, "").error().code == "too_soon");
  w.advanceMinutes(10);
  CHECK(w.post("dominique", "   ", "", {}, "").error().code == "invalid_text");
  CHECK(w.post("dominique", std::string(281, 'a'), "", {}, "").error().code == "too_long");
  std::string accents;
  for (int i = 0; i < 280; ++i) accents += "é";
  REQUIRE(w.post("dominique", accents, "", {}, ""));  // 280 characters (560 bytes): "é" is one
  w.advanceMinutes(10);
  CHECK(w.post("dominique", "Hi", "copper_tap", {}, "").error().code == "not_there");
  CHECK(w.post("dominique", "Hi", "", {"nobody"}, "").error().code == "unknown_person");
  CHECK(w.post("dominique", "Hi", "", {"maya"}, "").error().code == "not_known");
  CHECK(w.post("dominique", "Hi", "", {"dax", "aaliyah"}, "").error().code == "too_many_tags");
  const auto daxs = std::find_if(w.state().memories.begin(), w.state().memories.end(), [](const Memory& m) { return m.owner == "dax"; });
  REQUIRE(daxs != w.state().memories.end());
  CHECK(w.post("dominique", "Hi", "", {}, daxs->id).error().code == "unknown_event");
  CHECK(w.post("dominique", "Hi", "", {}, "mem-0").error().code == "unknown_event");
  CHECK(w.post("dominique", "Hi", "", {}, "", "livera.unfiltered").error().code == "not_your_account");
  CHECK(w.post("dominique", accents, "", {}, "").error().code == "duplicate");
  REQUIRE(w.post("dominique", "Third today", "", {}, ""));
  w.advanceMinutes(10);
  CHECK(w.post("dominique", "Fourth", "", {}, "").error().code == "daily_limit");
  // A dead phone, a cell, and someone who isn't in the world.
  WorldState dead = w.state();
  dead.characters.at("dominique").phone.battery = 0;
  CHECK(World(w.contentPtr(), dead).post("dominique", "Hi", "", {}, "").error().code == "phone_dead");
  WorldState held = w.state();
  held.characters.at("dominique").jailedUntil = held.now + 600;
  CHECK(World(w.contentPtr(), held).post("dominique", "Hi", "", {}, "").error().code == "in_jail");
  CHECK(w.post("leila", "Hi", "", {}, "").error().code == "not_in_world");
  // The next day the count starts again.
  w.advanceMinutes(kMinutesPerDay);
  CHECK(w.post("dominique", "Fourth", "", {}, ""));
}

TEST_CASE("social: whoever runs the gossip account can post as it, and nobody is told who that is") {
  World w = socialWorld(socialContent(), {"sienna", "dax"});
  auto r = w.post("sienna", "Who wore it better tonight?", "", {}, "", "livera.unfiltered");
  REQUIRE(r);
  CHECK(r.value()["post"]["author"]["account"] == "livera.unfiltered");
  CHECK(r.value()["post"]["author"]["gossip"] == true);
  const Json daxSees = w.socialProfile("dax", "livera.unfiltered").value();
  CHECK(!daxSees["account"].contains("you_run_it"));
  CHECK(!contains(daxSees.dump(), "sienna"));
  CHECK(w.socialProfile("sienna", "livera.unfiltered").value()["account"]["you_run_it"] == true);
  CHECK(postsBy(w, "sienna").empty());
}

TEST_CASE("social: like, unlike, comment, follow, unfollow, the feeds and the profile; every refusal") {
  World w = socialWorld(socialContent([](Json& s) {
                          s["comment"]["per_post"] = 2;
                          s["comment"]["per_day"] = 2;
                          s["like"]["per_day"] = 2;
                          s["follow"]["max_following"] = 3;
                        }),
                        {"dominique", "dax", "aaliyah"});
  REQUIRE(w.post("dominique", "Morning, Livéra", "", {}, ""));
  const std::string a = lastPostId(w);
  REQUIRE(w.post("aaliyah", "Party planning", "", {}, ""));
  const std::string b = lastPostId(w);
  // Likes.
  auto liked = w.like("dax", a, true);
  REQUIRE(liked);
  CHECK(liked.value()["likes"] == 1);
  CHECK(w.like("dax", a, true).error().code == "already_liked");
  CHECK(w.like("dominique", a, true).error().code == "own_post");
  CHECK(w.like("dax", "post-0", true).error().code == "unknown_post");
  REQUIRE(w.like("dax", a, false));
  CHECK(w.like("dax", a, false).error().code == "not_liked");
  REQUIRE(w.like("dax", a, true));  // his second like today
  CHECK(w.like("dax", b, true).error().code == "daily_limit");
  // Comments.
  REQUIRE(w.comment("dax", a, "Morning!"));
  CHECK(w.comment("dax", b, "Invite me").error().code == "too_soon");
  w.advanceMinutes(1);
  CHECK(w.comment("dax", a, "  ").error().code == "invalid_text");
  CHECK(w.comment("dax", a, std::string(201, 'x')).error().code == "too_long");
  CHECK(w.comment("dax", "post-0", "Hi").error().code == "unknown_post");
  REQUIRE(w.comment("aaliyah", a, "Coffee later?"));
  CHECK(w.comment("dax", a, "One more").error().code == "post_full");
  REQUIRE(w.comment("dax", b, "Invite me"));
  w.advanceMinutes(1);
  CHECK(w.comment("dax", b, "Please").error().code == "daily_limit");
  const Json shown = w.socialProfile("dominique", "dominique").value()["posts"];
  const auto mine = findIn(shown, a);
  REQUIRE(mine);
  CHECK((*mine)["comments"] == 2);
  CHECK((*mine)["recent_comments"].size() == 2);
  CHECK((*mine)["recent_comments"][0]["text"] == "Morning!");
  // Follows: Dax starts with Julian and Andre (people he knew before Livéra).
  REQUIRE(w.state().social.accounts.at("dax").following.size() == 2);
  auto followed = w.follow("dax", "dominique", true);
  REQUIRE(followed);
  CHECK(followed.value()["following"] == true);
  CHECK(w.follow("dax", "dominique", true).error().code == "already_following");
  CHECK(w.follow("dax", "dax", true).error().code == "invalid_target");
  CHECK(w.follow("dax", "nobody", true).error().code == "unknown_account");
  CHECK(w.follow("dax", "aaliyah", true).error().code == "too_many");
  CHECK(w.follow("dax", "aaliyah", false).error().code == "not_following");
  CHECK(w.follow("dax", "nobody", false).error().code == "unknown_account");
  REQUIRE(w.follow("dax", "dominique", false));
  REQUIRE(w.follow("dax", "livera.unfiltered", true));
  // The feeds and the profile.
  CHECK(w.socialFeed("dax", "everything").error().code == "bad_tab");
  CHECK(w.socialProfile("dax", "nobody").error().code == "unknown_account");
  CHECK(w.socialFeed("leila", "town").error().code == "not_in_world");
  const Json prof = w.socialProfile("dax", "dominique").value();
  CHECK(prof["account"]["handle"] == "dom.ashford");
  CHECK(prof["account"]["known"] == true);
  CHECK(prof["account"]["you_follow"] == false);
  CHECK(prof["posts"].size() == 1);
}

TEST_CASE("social: a new follower and a new like add a little fame, never past the day's cap, and warm the author's side") {
  World w = socialWorld(socialContent([](Json& s) { s["fame"] = {{"per_follower", 0.5}, {"per_like", 0.25}, {"max_per_day", 1.0}}; }),
                        {"dominique", "dax", "aaliyah", "julian"});
  const double fame0 = w.character("dominique")->fame;
  const double daxFame0 = w.character("dax")->fame;
  const double familiarity0 = w.relationshipValue("dominique", "dax", "familiarity");
  REQUIRE(w.post("dominique", "Big day", "", {}, ""));
  const std::string pid = lastPostId(w);
  REQUIRE(w.follow("dax", "dominique", true));
  CHECK(near(w.character("dominique")->fame, fame0 + 0.5));
  CHECK(w.relationshipValue("dominique", "dax", "familiarity") > familiarity0);
  // Unfollowing and following again isn't a new follower.
  REQUIRE(w.follow("dax", "dominique", false));
  REQUIRE(w.follow("dax", "dominique", true));
  CHECK(near(w.character("dominique")->fame, fame0 + 0.5));
  REQUIRE(w.like("dax", pid, true));
  CHECK(near(w.character("dominique")->fame, fame0 + 0.75));
  // Nor is unliking and liking again a new like.
  REQUIRE(w.like("dax", pid, false));
  REQUIRE(w.like("dax", pid, true));
  CHECK(near(w.character("dominique")->fame, fame0 + 0.75));
  REQUIRE(w.like("aaliyah", pid, true));
  REQUIRE(w.like("julian", pid, true));  // past the day's cap
  CHECK(near(w.character("dominique")->fame, fame0 + 1.0));
  // Nobody gains anything from liking or following: only the author.
  CHECK(near(w.character("dax")->fame, daxFame0));
}

TEST_CASE("social: likes, comments, follows and tags reach the author as a toast, never more than the hour's limit") {
  World w = socialWorld(socialContent([](Json& s) { s["notify"]["per_hour"] = 2; }), {"dominique", "dax", "aaliyah", "julian"});
  REQUIRE(w.post("dominique", "New in town", "", {}, ""));
  const std::string pid = lastPostId(w);
  (void)w.drainEvents();
  REQUIRE(w.like("dax", pid, true));
  REQUIRE(w.like("aaliyah", pid, true));  // the same post within the hour: one entry, one toast
  REQUIRE(w.comment("dax", pid, "Welcome!"));
  REQUIRE(w.follow("julian", "dominique", true));  // past the hour's two toasts: waits in the app
  auto toasts = eventsOf(w.drainEvents(), "dominique", "social");
  REQUIRE(toasts.size() == 2);
  CHECK(toasts[0]["kind"] == "like");
  CHECK(toasts[0]["text"] == "Dax liked your post.");
  CHECK(toasts[1]["kind"] == "comment");
  Json app = w.openPhoneApp("dominique", "social").value();
  CHECK(app["new_activity"] == 3);
  REQUIRE(app["activity"].size() == 3);
  CHECK(app["activity"][0]["kind"] == "follow");
  CHECK(app["activity"][2]["kind"] == "like");
  CHECK(app["activity"][2]["count"] == 2);
  CHECK(w.openPhoneApp("dominique", "social").value()["new_activity"] == 0);  // seen
  // Nobody is told about what they did themselves; the next hour there's room again.
  w.advanceMinutes(60);
  (void)w.drainEvents();
  REQUIRE(w.like("dax", pid, false));
  REQUIRE(w.post("dax", "Back at it", "", {"dominique"}, ""));
  toasts = eventsOf(w.drainEvents(), "dominique", "social");
  REQUIRE(toasts.size() == 1);
  CHECK(toasts[0]["kind"] == "tag");
  CHECK(eventsOf(w.drainEvents(), "dax", "social").empty());
}

TEST_CASE("social: the game nudges at most once a day; what people do is never held back by that") {
  World w = socialWorld(socialContent(), {"dominique", "dax", "julian", "andre"});
  for (const char* id : {"dominique", "dax", "julian", "andre"}) walkInto(w, id, "heritage_coffee");
  (void)w.drainEvents();
  REQUIRE(w.interact("dominique", "argue", "julian"));
  REQUIRE(w.interact("dominique", "argue", "dax"));
  w.advanceMinutes(40);  // two scenes, two posts about her by the gossip account
  CHECK(postsBy(w, "livera.unfiltered").size() == 2);
  auto toasts = eventsOf(w.drainEvents(), "dominique", "social");
  REQUIRE(toasts.size() == 1);
  CHECK(toasts[0]["kind"] == "gossip");
  const Json app = w.openPhoneApp("dominique", "social").value();
  int gossip = 0;
  for (const auto& a : app["activity"]) gossip += a["kind"] == "gossip" ? 1 : 0;
  CHECK(gossip == 2);  // both are in the app
  // A person's like still reaches her the same day.
  REQUIRE(w.post("dominique", "Long day.", "", {}, ""));
  REQUIRE(w.like("andre", lastPostId(w), true));
  toasts = eventsOf(w.drainEvents(), "dominique", "social");
  REQUIRE(toasts.size() == 1);
  CHECK(toasts[0]["kind"] == "like");
}

TEST_CASE("social: in the morning the feed opens with Last night in Livéra: the night's top posts and the gossip account's") {
  World w = socialWorld(socialContent([](Json& s) { s["post"]["min_gap_minutes"] = 0; }), {"dominique", "dax", "julian", "aaliyah"});
  REQUIRE(w.post("aaliyah", "Afternoon post", "", {}, ""));  // 10:00: not last night
  w.advanceMinutes(10 * 60);  // 20:00
  for (const char* id : {"dominique", "dax", "julian"}) walkInto(w, id, "copper_tap");
  REQUIRE(w.post("aaliyah", "Quiet one", "", {}, ""));
  const std::string quiet = lastPostId(w);
  REQUIRE(w.post("dax", "Darts champion", "", {}, ""));
  const std::string loud = lastPostId(w);
  REQUIRE(w.like("dominique", loud, true));
  REQUIRE(w.like("julian", loud, true));
  REQUIRE(w.comment("aaliyah", loud, "Rematch"));
  REQUIRE(w.interact("dax", "argue", "julian"));  // seen by Dominique
  w.advanceMinutes(40);
  REQUIRE(postsBy(w, "livera.unfiltered").size() == 1);
  // Not in the evening: the section is the morning's.
  CHECK(!w.openPhoneApp("dominique", "social").value().contains("last_night"));
  const GameMinutes eight = (w.now() / kMinutesPerDay + 1) * kMinutesPerDay + 8 * 60;
  w.advanceMinutes(eight - w.now());
  const Json night = w.openPhoneApp("dominique", "social").value()["last_night"];
  REQUIRE(night.is_object());
  REQUIRE(night["top"].size() >= 2);
  CHECK(night["top"][0]["post"] == loud);  // two likes and a comment come first
  CHECK(night["top"][1]["post"] == quiet);
  for (const auto& p : night["top"]) CHECK(p["text"] != "Afternoon post");
  REQUIRE(night["gossip"].size() == 1);
  CHECK(night["gossip"][0]["author"]["gossip"] == true);
  CHECK(night["gossip"][0]["gossip"]["you_were_there"] == true);
  // By the afternoon it's gone.
  w.advanceMinutes(5 * 60);
  CHECK(!w.openPhoneApp("dominique", "social").value().contains("last_night"));
}

// ---- The privacy rule -------------------------------------------------------------------------------
TEST_CASE("social: the privacy rule: a feed holds only what that character could know") {
  World w = socialWorld(socialContent(), {"dominique", "dax", "julian", "leila", "sienna"});
  REQUIRE(w.sendMessage("dax", "dominique", "PRIVATE-NOTE-42"));
  // Leila posts: Dominique doesn't follow her and isn't in it, so it's in the town tab, not her feed.
  REQUIRE(w.post("leila", "Council meets at seven.", "", {}, ""));
  const std::string council = lastPostId(w);
  CHECK(!feedHasPost(feed(w, "dominique", "following"), council));
  CHECK(feedHasPost(feed(w, "dominique", "town"), council));
  // A post she's tagged in is in her feed.
  w.advanceMinutes(10);
  REQUIRE(w.post("leila", "Thanks for the tip.", "", {"dominique"}, ""));
  CHECK(feedHasPost(feed(w, "dominique", "following"), lastPostId(w)));

  // A scene at Heritage Coffee: Dax argues with Julian in front of Dominique. Leila is at home.
  for (const char* id : {"dominique", "dax", "julian"}) walkInto(w, id, "heritage_coffee");
  REQUIRE(w.interact("dax", "argue", "julian"));
  w.advanceMinutes(31);
  const auto gossip = postsBy(w, "livera.unfiltered", "argument");
  REQUIRE(gossip.size() == 1);
  const std::string scene = gossip[0]->id;
  // Dominique was there: she knows whether it's true. Leila wasn't: she can see it in the town tab, not whether.
  const auto there = findIn(feed(w, "dominique", "following"), scene);
  REQUIRE(there);
  CHECK((*there)["gossip"]["you_were_there"] == true);
  CHECK((*there)["gossip"]["true"] == true);
  CHECK((*there)["gossip"]["heard_by"] == 1);
  CHECK(!feedHasPost(feed(w, "leila", "following"), scene));  // she doesn't follow it and hasn't heard
  const auto told = findIn(feed(w, "leila", "town"), scene);
  REQUIRE(told);
  CHECK((*told)["gossip"]["you_were_there"] == false);
  CHECK((*told)["gossip"]["true"].is_null());
  REQUIRE(w.follow("leila", "livera.unfiltered", true));
  CHECK(feedHasPost(feed(w, "leila", "following"), scene));

  // No view anyone gets holds a message, a who-heard list, who was there, someone's feelings or the account's runner.
  for (const char* who : {"dominique", "dax", "julian", "leila"}) {
    std::string all;
    for (const char* tab : {"following", "town"}) all += feed(w, who, tab).dump();
    all += w.openPhoneApp(who, "social").value().dump();
    for (const char* account : {"dominique", "dax", "julian", "leila", "livera.unfiltered"}) all += w.socialProfile(who, account).value().dump();
    CHECK(!contains(all, "PRIVATE-NOTE-42"));
    CHECK(!contains(all, "\"there\""));
    CHECK(!contains(all, "truthful"));
    CHECK(!contains(all, "heard_by\":["));
    CHECK(!contains(all, "friendship"));
    CHECK(!contains(all, "your_feelings"));
    CHECK(!contains(all, "you_run_it"));
    CHECK(!contains(w.socialProfile(who, "livera.unfiltered").value().dump(), "sienna"));
  }
}

// ---- What the game posts ------------------------------------------------------------------------------
TEST_CASE("social: someone a script plays posts what really happened to them, in their voice; a person is offered it") {
  World w = socialWorld(socialContent([](Json& s) {
                          s["auto"]["min_gap_minutes"] = 0;
                          s["auto"]["per_day"] = 3;
                        }),
                        {"dominique", "dax", "aaliyah"});
  w.setScripted("dax", true, "autopilot");
  w.setScripted("aaliyah", true, "autopilot");
  CHECK(postsBy(w, "dax").empty());  // nothing has happened yet, so nothing is posted
  // Dax buys a gold watch (a status symbol by the data): remembered, and posted five minutes later while he's there.
  walkInto(w, "dax", "lustre_jewelers");
  REQUIRE(w.buy("dax", "gold_watch", "card"));
  const Memory* bought = memoryOf(w, "dax", "status_purchase");
  REQUIRE(bought);
  CHECK(postsBy(w, "dax", "purchase").empty());
  w.advanceMinutes(7);
  const auto watch = postsBy(w, "dax", "purchase");
  REQUIRE(watch.size() == 1);
  CHECK(watch[0]->automatic);
  CHECK(watch[0]->about == bought->id);
  CHECK(watch[0]->place == "lustre_jewelers");
  CHECK(watch[0]->text == "Treated myself: Gold watch. ✨");  // Dax's voice is the default one
  const auto found = findIn(feed(w, "dominique", "town"), watch[0]->id);
  REQUIRE(found);
  const Json shown = *found;
  CHECK(shown["automatic"] == true);
  CHECK(shown["author"]["scripted"] == true);
  CHECK(shown["author"]["played_by"] == "autopilot");
  CHECK(shown["topic_label"] == "New in");
  // Walking into a jeweller's is a check-in, posted only because he's still there.
  CHECK(postsBy(w, "dax", "out").size() == 1);
  // Aaliyah (sociable and sure of herself) writes in her own voice.
  walkInto(w, "aaliyah", "lustre_jewelers");
  REQUIRE(w.buy("aaliyah", "gold_watch", "card"));
  w.advanceMinutes(7);
  const auto hers = postsBy(w, "aaliyah", "purchase");
  REQUIRE(hers.size() == 1);
  CHECK(hers[0]->text == "New Gold watch, who dis ✨ (yes it was worth it)");
  // A check-in after they've gone isn't true any more: nothing is posted.
  walkInto(w, "dax", "heritage_coffee");
  REQUIRE(w.exitBuilding("dax"));
  w.advanceMinutes(7);
  CHECK(postsBy(w, "dax", "out").size() == 1);
  // Three automatic posts a day at most (the data): the third goes out, a fourth would wait for tomorrow.
  walkInto(w, "dax", "heritage_coffee");
  w.advanceMinutes(7);
  CHECK(postsBy(w, "dax").size() == 3);
  REQUIRE(w.exitBuilding("dax"));
  walkInto(w, "dax", "fade_glow");
  w.advanceMinutes(7);
  CHECK(postsBy(w, "dax").size() == 3);

  // Dominique is a person: the game never posts for her; her social app offers it to share, in her voice.
  walkInto(w, "dominique", "lustre_jewelers");
  REQUIRE(w.buy("dominique", "gold_watch", "card"));
  w.advanceMinutes(10);
  CHECK(postsBy(w, "dominique").empty());
  const Json app = w.openPhoneApp("dominique", "social").value();
  REQUIRE(app["share"].size() == 1);
  const Json offer = app["share"][0];
  CHECK(offer["topic"] == "purchase");
  CHECK(contains(offer["text"].get<std::string>(), "Gold watch"));
  CHECK(offer["here"] == true);
  auto shared = w.post("dominique", offer["text"].get<std::string>(), "lustre_jewelers", {}, offer["about"].get<std::string>());
  REQUIRE(shared);
  CHECK(shared.value()["post"]["topic"] == "purchase");
  CHECK(w.openPhoneApp("dominique", "social").value()["share"].empty());
}

TEST_CASE("social: a promotion is posted for someone a script plays, from the World's own records") {
  // A promotion needs hours at the level and the performance: a short ladder for this test.
  World w = socialWorld(socialContent({}, [](Json& doc, const std::string& file) {
                          if (file == "founding_careers.json" || file == "more_careers.json") {
                            for (auto& c : doc["careers"]) {
                              for (auto& lv : c["levels"]) {
                                if (lv.contains("hours_to_promote")) lv["hours_to_promote"] = 1;
                                if (lv.contains("min_performance")) lv["min_performance"] = 0;
                              }
                            }
                          }
                        }),
                        {"dax"});
  w.setScripted("dax", true, "script");
  walkInto(w, "dax", "parallax_labs");
  REQUIRE(w.startShift("dax"));
  w.advanceMinutes(90);
  auto shift = w.endShift("dax");
  REQUIRE(shift);
  REQUIRE(shift.value().contains("promoted_to"));
  const std::string title = shift.value()["promoted_to"].get<std::string>();
  w.advanceMinutes(7);
  const auto posts = postsBy(w, "dax", "promotion");
  REQUIRE(posts.size() == 1);
  CHECK(contains(posts[0]->text, title));
  CHECK(posts[0]->about == memoryOf(w, "dax", "promotion")->id);
}

TEST_CASE("social: a day of the town on the autopilot: founders post about where they really are, with the real data") {
  World w = World::createNew(realContent());
  Autopilot pilot;
  std::vector<CharacterId> all;
  for (const auto& [id, def] : w.content().characters()) {
    if (def.playable) all.push_back(id);
  }
  if (std::getenv("LIVERA_SOCIAL_LOG")) pilot.setLog([](const std::string& line) { std::fprintf(stderr, "%s\n", line.c_str()); });
  pilot.start(w, all);
  const GameMinutes end = w.now() + 14 * 60;  // 07:00 to 21:00
  while (w.now() < end) {
    w.advanceRealTime(0.5);
    pilot.step(w, 0.5);
    pilot.observe(w.drainEvents());
  }
  int automatic = 0;
  for (const auto& p : w.state().social.posts) {
    if (!p.automatic || p.author == "livera.unfiltered") continue;
    ++automatic;
    if (std::getenv("LIVERA_SOCIAL_LOG")) std::fprintf(stderr, "    %s %s: %s\n", formatDateTime(p.at).c_str(), p.author.c_str(), p.text.c_str());
    CHECK(!p.text.empty());
    CHECK(!p.topic.empty());
    if (p.topic == "out") CHECK(!p.place.empty());  // a check-in names where they were
  }
  std::fprintf(stderr, "    (%d posts written by the game in a day)\n", automatic);
  CHECK(automatic >= 1);
}

// ---- The gossip account ----------------------------------------------------------------------------
TEST_CASE("social: the gossip account posts only scenes people witnessed, with how many heard, and spreads") {
  World w = socialWorld(socialContent([](Json& s) { s["unfiltered"]["delay_minutes"] = 20; }), {"dominique", "dax", "julian", "andre"});
  walkInto(w, "dominique", "heritage_coffee");
  walkInto(w, "julian", "heritage_coffee");
  // An argument nobody saw: no rumour, nothing to post.
  REQUIRE(w.interact("dominique", "argue", "julian"));
  w.advanceMinutes(30);
  CHECK(postsBy(w, "livera.unfiltered").empty());
  CHECK(w.state().details.rumors.empty());
  // In front of Dax it's a scene: a rumour now, a post twenty minutes on.
  walkInto(w, "dax", "heritage_coffee");
  REQUIRE(w.interact("dominique", "argue", "julian"));
  REQUIRE(w.state().details.rumors.size() == 1);
  const Rumor& r = w.state().details.rumors[0];
  CHECK(r.kind == "argument");
  CHECK(r.about == "dominique");
  CHECK(r.with == "julian");
  CHECK(r.tellers == std::vector<CharacterId>{"dax"});
  w.advanceMinutes(19);
  CHECK(postsBy(w, "livera.unfiltered").empty());
  w.advanceMinutes(2);
  const auto posts = postsBy(w, "livera.unfiltered", "argument");
  REQUIRE(posts.size() == 1);
  const SocialPost& p = *posts[0];
  CHECK(p.automatic);
  CHECK(p.place == "heritage_coffee");
  CHECK(has(p.tags, "dominique"));
  CHECK(has(p.tags, "julian"));
  CHECK(contains(p.text, "Dominique"));
  CHECK(contains(p.text, "Heritage Coffee"));
  CHECK(w.state().details.rumors[0].post == p.id);
  // Dominique and Julian were told they're in it.
  const auto evs = w.drainEvents();
  CHECK(!eventsOf(evs, "dominique", "social").empty());
  CHECK(eventsOf(evs, "dominique", "social").back()["kind"] == "gossip");
  // Dax tells Andre, a close friend (45), within the hour: the post says two heard it, and it reached Andre's feed.
  w.advanceMinutes(60);
  const SocialPost& later = *postsBy(w, "livera.unfiltered", "argument")[0];
  CHECK(has(later.heardBy, "andre"));
  CHECK(later.heardBy.size() == 2);
  CHECK(!w.state().social.accounts.count("andre") ||
        !has(w.state().social.accounts.at("andre").following, "livera.unfiltered"));  // he doesn't follow it
  const auto heard = findIn(feed(w, "andre", "following"), later.id);
  REQUIRE(heard);
  CHECK((*heard)["gossip"]["heard_by"] == 2);
  CHECK((*heard)["gossip"]["you_heard"] == true);
  CHECK((*heard)["gossip"]["true"].is_null());  // told, not there
}

TEST_CASE("social: a fight, an arrest and a kiss in a bar are posted when seen; a kiss at the grocer's isn't news") {
  auto db = socialContent({}, [](Json& doc, const std::string& file) {
    if (file == "crimes.json") {
      for (auto& c : doc["crime"]["crimes"]) {
        if (c["id"] == "shoplifting") c["detection"] = 1.0;
      }
    }
  });
  // A fight with nobody watching: no rumour, no post. With Julian watching: both.
  {
    World w = socialWorld(db, {"dominique", "dax", "julian"});
    walkInto(w, "dominique", "heritage_coffee");
    walkInto(w, "dax", "heritage_coffee");
    REQUIRE(w.setWalkAwayFromFights("dax", true));
    REQUIRE(w.startFight("dominique", "dax"));
    w.advanceMinutes(40);
    CHECK(postsBy(w, "livera.unfiltered").empty());
  }
  {
    World w = socialWorld(db, {"dominique", "dax", "julian"});
    for (const char* id : {"dominique", "dax", "julian"}) walkInto(w, id, "heritage_coffee");
    REQUIRE(w.setWalkAwayFromFights("dax", true));
    REQUIRE(w.startFight("dominique", "dax"));
    w.advanceMinutes(40);
    const auto fights = postsBy(w, "livera.unfiltered", "fight");
    REQUIRE(fights.size() == 1);
    CHECK(has(fights[0]->there, "julian"));
    CHECK(has(fights[0]->tags, "dax"));
  }
  // Caught shoplifting in front of Dax: the arrest is a scene.
  {
    World w = socialWorld(db, {"dominique", "dax"});
    walkInto(w, "dominique", "thread_co");
    walkInto(w, "dax", "thread_co");
    auto caught = w.steal("dominique", "sunglasses");
    REQUIRE(caught);
    w.advanceMinutes(40);
    const auto arrests = postsBy(w, "livera.unfiltered", "arrest");
    REQUIRE(arrests.size() == 1);
    CHECK(arrests[0]->place == "thread_co");
    CHECK(has(arrests[0]->there, "dax"));
  }
  // A kiss at the grocer's in front of Julian: the data says it isn't news. At the Copper Tap it is.
  {
    World w = socialWorld(db, {"dominique", "dax", "julian"});
    for (const char* id : {"dominique", "dax", "julian"}) walkInto(w, id, "greenleaf_market");
    auto ask = w.request("dax", "kiss", "dominique");
    REQUIRE(ask);
    REQUIRE(w.respond("dominique", ask.value()["request"].get<std::string>(), true));
    w.advanceMinutes(40);
    CHECK(postsBy(w, "livera.unfiltered").empty());
    CHECK(w.state().details.rumors.empty());
    w.advanceMinutes(6 * 60);  // 16:40: the Copper Tap is open
    for (const char* id : {"dominique", "dax", "julian"}) walkInto(w, id, "copper_tap");
    ask = w.request("dax", "kiss", "dominique");
    REQUIRE(ask);
    REQUIRE(w.respond("dominique", ask.value()["request"].get<std::string>(), true));
    w.advanceMinutes(40);
    const auto kisses = postsBy(w, "livera.unfiltered", "kiss");
    REQUIRE(kisses.size() == 1);
    CHECK(kisses[0]->place == "copper_tap");
  }
}

TEST_CASE("social: the gossip account sometimes gets it wrong, and keeps to its daily limit") {
  World w = socialWorld(socialContent([](Json& s) {
                          s["unfiltered"]["twist_chance"] = 1.0;
                          s["unfiltered"]["per_day"] = 1;
                        }),
                        {"dominique", "dax", "julian", "andre"});
  for (const char* id : {"dominique", "dax", "julian", "andre"}) walkInto(w, id, "heritage_coffee");
  REQUIRE(w.interact("dominique", "argue", "julian"));
  REQUIRE(w.interact("dax", "argue", "andre"));
  w.advanceMinutes(40);
  const auto posts = postsBy(w, "livera.unfiltered");
  REQUIRE(posts.size() == 1);  // one a day: the other waits
  CHECK(!posts[0]->truthful);
  const auto view = findIn(feed(w, "dax", "town"), posts[0]->id);  // Dax was there
  REQUIRE(view);
  CHECK((*view)["gossip"]["true"] == false);
  CHECK(!contains(view->dump(), "truthful"));
  // The other scene is still news tomorrow (the rumour runs a day): it goes out once the day turns.
  w.advanceMinutes(kMinutesPerDay);
  CHECK(postsBy(w, "livera.unfiltered").size() == 2);
}

// ---- The map app and messages ----------------------------------------------------------------------
TEST_CASE("social: the map app shows your people where your character could know they are, and nobody else") {
  World w = socialWorld(socialContent(), {"dominique", "dax", "aaliyah", "maya", "leila"});
  walkInto(w, "dominique", "heritage_coffee");
  walkInto(w, "dax", "heritage_coffee");
  walkInto(w, "aaliyah", "lustre_jewelers");
  walkInto(w, "maya", "heritage_coffee");
  REQUIRE(w.post("aaliyah", "Shopping", "lustre_jewelers", {}, ""));
  const Json map = w.openPhoneApp("dominique", "map").value();
  // The places anyone may walk into, open now (not homes, not staff-only offices); small: the town is the map op's.
  CHECK(has(map["open_now"].get<std::vector<std::string>>(), "heritage_coffee"));
  CHECK(!has(map["open_now"].get<std::vector<std::string>>(), "lexington_1204"));
  CHECK(!has(map["open_now"].get<std::vector<std::string>>(), "parallax_labs"));
  CHECK(map.dump().size() < 8000);
  std::map<std::string, Json> people;
  for (const auto& p : map["people"]) people[p["character"].get<std::string>()] = p;
  REQUIRE(people.count("dax"));
  CHECK(people["dax"]["where"] == "in_sight");
  CHECK(people["dax"]["inside"] == "heritage_coffee");
  REQUIRE(people.count("aaliyah"));
  CHECK(people["aaliyah"]["where"] == "posted");
  CHECK(people["aaliyah"]["place"]["id"] == "lustre_jewelers");
  CHECK(!people["aaliyah"].contains("position"));
  REQUIRE(people.count("leila"));
  CHECK(people["leila"]["where"] == "unknown");
  CHECK(!people.count("maya"));  // in the same café, but a stranger: not one of her people
  // A post from hours ago no longer says where someone is.
  w.advanceMinutes(7 * 60);
  for (const auto& p : w.openPhoneApp("dominique", "map").value()["people"]) {
    if (p["character"] == "aaliyah") CHECK(p["where"] != "posted");
  }
}

TEST_CASE("social: messages: seen, and someone the autopilot plays reads and answers by the data, never a script") {
  auto db = socialContent({}, [](Json& doc, const std::string& file) {
    if (file == "manners.json") doc["autopilot_manners"]["messages"]["replies_per_day"] = 1;
  });
  World w = World::createNew(db);
  Autopilot pilot;
  REQUIRE(w.connect("dominique"));
  pilot.start(w, {"dax"});
  auto tick = [&] {
    w.advanceRealTime(0.5);
    pilot.step(w, 0.5);
    pilot.observe(w.drainEvents());
  };
  for (int i = 0; i < 20 && !w.character("dax")->online; ++i) tick();
  REQUIRE(w.character("dax")->online);
  REQUIRE(w.sendMessage("dominique", "dax", "Coffee this week?"));
  auto thread = [&] { return w.openPhoneApp("dominique", "messages").value()["threads"]["dax"]; };
  CHECK(thread()[0]["seen"] == false);
  const Json info = w.openPhoneApp("dominique", "messages").value()["people"]["dax"];
  CHECK(info["scripted"] == true);
  CHECK(info["played_by"] == "autopilot");
  std::vector<WorldEvent> seenEvents;
  bool replied = false;
  for (int i = 0; i < 400 && !replied; ++i) {
    w.advanceRealTime(0.5);
    pilot.step(w, 0.5);
    auto evs = w.drainEvents();
    for (const auto& e : evs) {
      if (e.type == "message_seen") seenEvents.push_back(e);
    }
    pilot.observe(evs);
    replied = thread().size() >= 2;
  }
  REQUIRE(replied);
  const Json t = thread();
  CHECK(t[0]["seen"] == true);
  REQUIRE(!seenEvents.empty());
  CHECK(seenEvents[0].recipients == std::vector<CharacterId>{"dominique"});
  CHECK(t[1]["from"] == "dax");
  // Dax's own side toward her is friendship 20: the rule for friendship 15 and more.
  const std::string reply = t[1]["body"].get<std::string>();
  CHECK(reply == "Hey Dominique! Got your message." || reply == "Thanks, Dominique. Talk later?" ||
        reply == "Good to hear from you, Dominique.");
  // One reply a day to her (this test's data): a second message is read (after his shift, if he's at work), not
  // answered. A script writing to him is read but never answered either.
  REQUIRE(w.sendMessage("dominique", "dax", "Thursday?"));
  REQUIRE(w.connect("aaliyah"));
  w.setScripted("aaliyah", true, "script");
  REQUIRE(w.sendMessage("aaliyah", "dax", "Ping"));
  auto theirs = [&] { return w.openPhoneApp("aaliyah", "messages").value()["threads"]["dax"]; };
  for (int i = 0; i < 4000 && !(thread()[2]["seen"] == true && theirs()[0]["seen"] == true); ++i) tick();
  for (int i = 0; i < 20; ++i) tick();
  const Json t2 = thread();
  CHECK(t2.size() == 3);
  CHECK(t2[2]["seen"] == true);
  CHECK(theirs().size() == 1);
  CHECK(theirs()[0]["seen"] == true);
}

// ---- The save --------------------------------------------------------------------------------------------
TEST_CASE("social: posts, follows, likes, comments, moments and activity are saved, in JSON and in SQLite") {
  World w = socialWorld(socialContent(), {"dominique", "dax", "julian"});
  for (const char* id : {"dominique", "dax", "julian"}) walkInto(w, id, "heritage_coffee");
  REQUIRE(w.post("dominique", "Saved?", "heritage_coffee", {"dax"}, ""));
  const std::string pid = lastPostId(w);
  REQUIRE(w.like("dax", pid, true));
  REQUIRE(w.comment("dax", pid, "Saved."));
  REQUIRE(w.follow("dax", "dominique", true));
  REQUIRE(w.interact("dax", "argue", "julian"));  // a rumour with its new fields
  walkInto(w, "dominique", "lustre_jewelers");
  REQUIRE(w.buy("dominique", "gold_watch", "card"));  // a moment she could share
  w.advanceMinutes(40);
  const Json before = socialPartToJson(w.state());
  CHECK(!w.state().social.posts.empty());
  auto json = worldStateFromJson(worldStateToJson(w.state()));
  REQUIRE(json);
  CHECK(socialPartToJson(json.value()) == before);
  CHECK(detailsPartToJson(json.value()) == detailsPartToJson(w.state()));
  const auto path = tempPath("social_save.db");
  {
    auto store = SqliteStore::open(path.string());
    REQUIRE(store);
    REQUIRE(store.value()->saveWorld(w.state()));
  }
  auto store = SqliteStore::open(path.string());
  REQUIRE(store);
  auto loaded = store.value()->loadWorld();
  REQUIRE(loaded);
  CHECK(socialPartToJson(loaded.value()) == before);
  const Rumor& r = loaded.value().details.rumors.at(0);
  CHECK(r.kind == "argument");
  CHECK(r.with == "julian");
  CHECK(!r.id.empty());
  CHECK(!r.post.empty());
}
