// livera_cli: headless development client for the LIVÉRA dedicated server.
//
// This is a test harness, not the game client. It speaks the same protocol a rendering
// client would, so every rule it can exercise is enforced by the server, not by it.
//
//   livera_cli [--host 127.0.0.1] [--port 7777] [--script FILE] [--quiet-events]
//
// Type `help` for commands. In --script mode, lines are run in order and `#` starts a comment.

#include <poll.h>
#include <unistd.h>

#include <chrono>
#include <cmath>
#include <cstdio>
#include <fstream>
#include <iostream>
#include <sstream>
#include <string>
#include <vector>

#include "client/CreatorWizard.h"
#include "client/MusicText.h"
#include "core/Types.h"
#include "net/Socket.h"

using livera::Json;
namespace net = livera::net;

namespace {

struct Client {
  net::Fd fd;
  net::LineBuffer buffer;
  long nextId = 1;
  bool quietEvents = false;
  bool failed = false;       // script mode exit code: connection lost or an unexpected refusal
  bool lastRefused = false;  // the server refused the most recent request
  bool interactive = false;
  std::string myCharacter;   // from login / create, so `play` needs no id
  Json songDraft;            // song being composed locally, sent on `song save`
  std::string lastSongId;    // most recently saved song, usable as `last`
  Json instruments;          // id -> {label, drums, midi_program}, fetched on first use
};

std::string money(long long cents) {
  char buf[64];
  std::snprintf(buf, sizeof buf, "%s$%lld.%02lld", cents < 0 ? "-" : "", std::llabs(cents) / 100, std::llabs(cents) % 100);
  return buf;
}

void printEvent(const Client& c, const Json& ev) {
  if (c.quietEvents) return;
  const std::string type = ev.value("event", "");
  const Json& d = ev.contains("data") ? ev["data"] : Json::object();
  if (type == "notification") std::printf("  [phone] %s\n", d.value("text", "").c_str());
  else if (type == "message") std::printf("  [message from %s] %s\n", d.value("from", "").c_str(), d.value("body", "").c_str());
  else if (type == "interaction") std::printf("  [%s: %s]\n", d.value("from", "").c_str(), d.value("label", "").c_str());
  else if (type == "presence") {
    std::printf("  [%s %s%s]\n", d.value("character", "").c_str(), d.value("status", "").c_str(),
                d.contains("location") ? (" " + d.value("location", "")).c_str() : "");
  } else if (type == "arrived") std::printf("  [you arrived]\n");
  else if (type == "speech") {
    const std::string volume = d.value("volume", "say");
    const char* how = volume == "shout" ? " shouts" : volume == "whisper" ? " whispers" : "";
    std::printf("  %s%s: \"%s\"\n", d.value("name", "").c_str(), how, d.value("text", "").c_str());
  } else if (type == "performance") {
    std::printf("  ♪ %s performs \"%s\" (quality %.0f)\n", d.value("name", "").c_str(),
                d["song"].value("title", "").c_str(), d.value("quality", 0.0));
  } else if (type == "request") {
    std::printf("  ♥ %s  → answer %s yes|no\n", d.value("text", "").c_str(), d.value("id", "").c_str());
  } else if (type == "answer") {
    std::printf("  ♥ [%s: %s]\n", d.value("kind", "").c_str(), d.value("accepted", false) ? "yes" : "no");
  } else if (type == "incident") {
    std::printf("  [%s: %s]\n", d.value("character", "").c_str(), d.value("kind", "").c_str());
  } else if (type == "gift") {
    std::printf("  [%s gave you %s]\n", d.value("from", "").c_str(), d.value("label", "").c_str());
  }
  else std::printf("  [%s] %s\n", type.c_str(), d.dump().c_str());
}

void printLook(const Json& d) {
  const Json& t = d["time"];
  std::printf("  %s (%s)\n", t.value("text", "").c_str(), t.value("phase", "").c_str());
  const Json& you = d["you"];
  if (!you.value("inside", "").empty()) {
    const Json& here = d["here"];
    std::printf("  You are inside %s\n    %s\n", here.value("name", "").c_str(), here.value("description", "").c_str());
  } else {
    std::printf("  You are outdoors at (%.0f, %.0f)%s\n", you["position"][0].get<double>(),
                you["position"][1].get<double>(), you.value("moving", false) ? ", walking" : "");
    for (const auto& n : d["nearby"]) {
      std::printf("    %-24s %-28s %4.0fm  %s", n.value("id", "").c_str(), n.value("name", "").c_str(),
                  n.value("distance_m", 0.0), n.value("status", "").c_str());
      if (n.contains("construction")) {
        const Json& c = n["construction"];
        std::printf("  [%s %.1f%%, crew on site: %d]", c.value("project", "").c_str(), c.value("progress_pct", 0.0),
                    c.value("crew_on_site", 0));
      }
      std::printf("\n");
    }
  }
  const Json& here = d["here"];
  if (here.contains("name") && you.value("inside", "").empty())
    std::printf("  You are at %s\n    %s\n", here.value("name", "").c_str(), here.value("description", "").c_str());
  if (here.contains("offers")) {
    for (const auto& o : here["offers"])
      std::printf("    buy %-18s %-28s %s\n", o.value("id", "").c_str(), o.value("label", "").c_str(),
                  money(o.value("price_cents", 0LL)).c_str());
    for (const auto& a : here["activities"])
      std::printf("    do  %-18s %s\n", a.value("id", "").c_str(), a.value("label", "").c_str());
  }
  std::printf("  Needs:");
  for (const auto& [k, v] : you["needs"].items()) std::printf(" %s %.0f", k.c_str(), v.get<double>());
  std::printf("\n");
  if (!d["people"].empty()) {
    std::printf("  People here:");
    for (const auto& p : d["people"]) std::printf(" %s (%s)", p.value("name", "").c_str(), p.value("id", "").c_str());
    std::printf("\n");
  }
}

void printBank(const Json& d) {
  std::printf("  Bank %s   Cash %s", money(d.value("bank_cents", 0LL)).c_str(), money(d.value("cash_cents", 0LL)).c_str());
  if (d.value("rent_arrears_cents", 0LL) > 0) std::printf("   Rent owed %s", money(d.value("rent_arrears_cents", 0LL)).c_str());
  std::printf("\n");
  for (const auto& t : d["recent"])
    std::printf("    %10s  %-6s %s\n", money(t.value("amount_cents", 0LL)).c_str(), t.value("account", "").c_str(),
                t.value("memo", "").c_str());
}

// Sends a request and waits for its reply, printing any events that arrive meanwhile.
std::optional<Json> request(Client& c, Json req) {
  const long id = c.nextId++;
  req["id"] = id;
  if (!net::sendAll(c.fd, req.dump() + "\n")) {
    std::printf("  ! connection lost\n");
    return std::nullopt;
  }
  const auto deadline = std::chrono::steady_clock::now() + std::chrono::seconds(10);
  while (std::chrono::steady_clock::now() < deadline) {
    auto line = net::readLine(c.fd, c.buffer, 200);
    if (!line) {
      std::printf("  ! %s\n", line.error().message.c_str());
      return std::nullopt;
    }
    if (!line.value()) continue;
    Json msg = Json::parse(*line.value(), nullptr, false);
    if (msg.is_discarded()) continue;
    if (msg.contains("event")) {
      printEvent(c, msg);
      continue;
    }
    if (msg.value("re", Json()) == Json(id)) return msg;
  }
  std::printf("  ! no reply\n");
  return std::nullopt;
}

void drainEvents(Client& c, double seconds) {
  const auto until = std::chrono::steady_clock::now() + std::chrono::duration<double>(seconds);
  while (std::chrono::steady_clock::now() < until) {
    const auto left = std::chrono::duration_cast<std::chrono::milliseconds>(until - std::chrono::steady_clock::now());
    auto line = net::readLine(c.fd, c.buffer, static_cast<int>(std::max<long long>(1, left.count())));
    if (!line || !line.value()) continue;
    Json msg = Json::parse(*line.value(), nullptr, false);
    if (!msg.is_discarded() && msg.contains("event")) printEvent(c, msg);
  }
}

// Waits until the server sends an event of `type` (or the timeout passes).
bool waitForEvent(Client& c, const std::string& type, double seconds) {
  const auto until = std::chrono::steady_clock::now() + std::chrono::duration<double>(seconds);
  while (std::chrono::steady_clock::now() < until) {
    auto line = net::readLine(c.fd, c.buffer, 100);
    if (!line) return false;
    if (!line.value()) continue;
    Json msg = Json::parse(*line.value(), nullptr, false);
    if (msg.is_discarded() || !msg.contains("event")) continue;
    printEvent(c, msg);
    if (msg.value("event", "") == type) return true;
  }
  return false;
}

// Sends a request; on refusal prints the reason and returns nothing.
std::optional<Json> callOk(Client& c, const Json& req) {
  auto reply = request(c, req);
  if (!reply) {
    c.failed = true;
    return std::nullopt;
  }
  if (!reply->value("ok", false)) {
    c.lastRefused = true;
    const Json& e = (*reply)["error"];
    std::printf("  ✗ %s (%s)\n", e.value("message", "").c_str(), e.value("code", "").c_str());
    return std::nullopt;
  }
  return (*reply)["data"];
}

std::optional<Json> readJsonFile(const std::string& path) {
  std::ifstream in(path);
  if (!in) {
    std::printf("  ! can't read %s\n", path.c_str());
    return std::nullopt;
  }
  Json j = Json::parse(in, nullptr, false);
  if (j.is_discarded()) {
    std::printf("  ! %s isn't valid JSON\n", path.c_str());
    return std::nullopt;
  }
  return j;
}

bool ensureInstruments(Client& c) {
  if (c.instruments.is_object() && !c.instruments.empty()) return true;
  auto studio = callOk(c, {{"op", "phone"}, {"app", "studio"}});
  if (!studio) return false;
  c.instruments = Json::object();
  for (const auto& i : (*studio)["instruments"]) c.instruments[i.value("id", "")] = i;
  return true;
}

void printSongSummary(const Json& s) {
  std::printf("  %-10s \"%s\" by %s: %d bpm, %d tracks, %d notes, %.1fs%s, %d plays\n", s.value("id", "").c_str(),
              s.value("title", "").c_str(), s.value("by", "").c_str(), s.value("bpm", 0), s.value("tracks", 0),
              s.value("notes", 0), s.value("duration_seconds", 0.0), s.value("released", false) ? ", released" : "",
              s.value("plays", 0));
}

void createCharacter(Client& c, const std::string& file) {
  std::optional<Json> sheet;
  if (!file.empty()) {
    sheet = readJsonFile(file);
  } else if (!c.interactive) {
    std::printf("  ! in scripts, use: create FILE.json\n");
    c.lastRefused = true;
    return;
  } else if (auto options = callOk(c, {{"op", "creator_options"}})) {
    sheet = livera::client::runCreatorWizard(*options);
  }
  if (!sheet) return;
  auto made = callOk(c, {{"op", "create_character"}, {"character", *sheet}});
  if (!made) {
    if (file.empty()) {
      std::ofstream("my_character.json") << sheet->dump(2) << "\n";
      std::printf("  Your answers are saved in my_character.json. Fix it and run: create my_character.json\n");
    }
    return;
  }
  c.myCharacter = made->value("id", "");
  std::printf("  ✓ Welcome, %s (%s). Your new home: %s. Type `play` to move in.\n", made->value("name", "").c_str(),
              c.myCharacter.c_str(), made->value("home", "").c_str());
}

void songCommand(Client& c, std::istringstream& in) {
  std::string sub;
  in >> sub;
  auto arg = [&]() {
    std::string a;
    in >> a;
    return a;
  };
  auto rest = [&]() {
    std::string r;
    std::getline(in, r);
    const auto b = r.find_first_not_of(' ');
    return b == std::string::npos ? std::string() : r.substr(b);
  };
  auto songId = [&](const std::string& a) { return a == "last" ? c.lastSongId : a; };

  if (sub == "new") {
    int bpm = 0;
    try {
      bpm = std::stoi(arg());
    } catch (...) {
    }
    const std::string title = rest();
    if (bpm <= 0 || title.empty()) {
      std::printf("  usage: song new BPM TITLE\n");
      return;
    }
    c.songDraft = Json{{"title", title}, {"bpm", bpm}, {"tracks", Json::array()}};
    std::printf("  ♪ New song \"%s\" at %d bpm. Add tracks with `song track`.\n", title.c_str(), bpm);
  } else if (sub == "track") {
    if (!c.songDraft.is_object()) {
      std::printf("  start one first: song new BPM TITLE\n");
      return;
    }
    if (!ensureInstruments(c)) return;
    const std::string inst = arg();
    if (!c.instruments.contains(inst)) {
      std::printf("  unknown instrument '%s'. Try: ", inst.c_str());
      for (const auto& [id, i] : c.instruments.items()) std::printf("%s ", id.c_str());
      std::printf("\n");
      return;
    }
    auto notes = livera::client::parseNotes(rest(), c.instruments[inst].value("drums", false));
    if (!notes) {
      std::printf("  ✗ %s\n", notes.error().message.c_str());
      return;
    }
    c.songDraft["tracks"].push_back(Json{{"instrument", inst}, {"notes", notes.value()}});
    std::printf("  ♪ %s track with %zu notes\n", inst.c_str(), notes.value().size());
  } else if (sub == "repeat") {
    int times = 0;
    try {
      times = std::stoi(arg());
    } catch (...) {
    }
    if (!c.songDraft.is_object() || times < 2) {
      std::printf("  usage: song repeat TIMES (after adding tracks)\n");
      return;
    }
    int end = 0;
    for (const auto& t : c.songDraft["tracks"])
      for (const auto& n : t["notes"]) end = std::max(end, n[0].get<int>() + n[2].get<int>());
    const int bars = (end + 15) / 16 * 16;
    for (auto& t : c.songDraft["tracks"]) {
      Json copy = t["notes"];
      for (int k = 1; k < times; ++k) {
        for (auto n : copy) {
          n[0] = n[0].get<int>() + k * bars;
          if (n[0].get<int>() + n[2].get<int>() <= 256) t["notes"].push_back(n);
        }
      }
    }
    std::printf("  ♪ repeated %d times (%d bars)\n", times, std::min(16, bars / 16 * times));
  } else if (sub == "show") {
    if (!c.songDraft.is_object()) std::printf("  no song in progress\n");
    else std::printf("%s\n", c.songDraft.dump(2).c_str());
  } else if (sub == "save" || sub == "file") {
    Json song = c.songDraft;
    if (sub == "file") {
      auto loaded = readJsonFile(arg());
      if (!loaded) return;
      song = *loaded;
    }
    if (!song.is_object()) {
      std::printf("  nothing to save: song new BPM TITLE\n");
      return;
    }
    if (auto saved = callOk(c, {{"op", "song_save"}, {"song", song}})) {
      c.lastSongId = saved->value("id", "");
      std::printf("  ✓ Saved to your studio:\n");
      printSongSummary(*saved);
    }
  } else if (sub == "release") {
    if (auto r = callOk(c, {{"op", "song_release"}, {"song", songId(arg())}})) {
      std::printf("  ✓ Released to Livéra:\n");
      printSongSummary(*r);
    }
  } else if (sub == "list") {
    if (auto studio = callOk(c, {{"op", "phone"}, {"app", "studio"}})) {
      std::printf("  Your music skill: %.1f\n  Your songs:\n", (*studio).value("music_skill", 0.0));
      for (const auto& s : (*studio)["yours"]) printSongSummary(s);
      std::printf("  Town chart:\n");
      for (const auto& s : (*studio)["chart"]) printSongSummary(s);
      std::printf("  Instruments:");
      for (const auto& i : (*studio)["instruments"]) std::printf(" %s", i.value("id", "").c_str());
      std::printf("\n");
    }
  } else if (sub == "play") {
    if (auto song = callOk(c, {{"op", "song"}, {"song", songId(arg())}})) {
      std::printf("  ♪ \"%s\" by %s (%.1fs). Export it with `song export %s FILE.mid` to hear it.\n",
                  song->value("title", "").c_str(), song->value("by", "").c_str(), song->value("duration_seconds", 0.0),
                  song->value("id", "").c_str());
    }
  } else if (sub == "export") {
    const std::string id = songId(arg());
    const std::string path = arg();
    if (path.empty()) {
      std::printf("  usage: song export ID|last FILE.mid\n");
      return;
    }
    if (!ensureInstruments(c)) return;
    if (auto song = callOk(c, {{"op", "song"}, {"song", id}})) {
      if (auto st = livera::client::writeMidi(*song, c.instruments, path); !st) std::printf("  ✗ %s\n", st.error().message.c_str());
      else std::printf("  ✓ Wrote %s\n", path.c_str());
    }
  } else {
    std::printf("  song new | track | repeat | show | save | file | list | release | play | export\n");
  }
}

const char* kHelp = R"(Commands:
  register USER PASS        create an account (dev servers)
  login USER PASS           log in
  characters                list playable characters
  play ID                   enter the world as a character
  look | l                  what's around you
  map                       every place in town
  walk PLACE                walk to a place and wait until you get there
  go PLACE | move X Y       start walking somewhere and return immediately
  wait SECONDS              let real time pass, showing events
  enter PLACE | exit        go in / out of a building
  talk ID [INTERACTION]     chat (default), compliment, joke, deep_talk, argue
  buy OFFER [card|cash]     buy something where you are
  do ACTIVITY               do something here for free (shower, nap, jog...)
  work start | work end     start / finish a shift at your workplace
  phone APP                 bank, messages, contacts, calendar, map, career, property, notifications, city,
                            health, items, transit, school, jobs, record, romance, fame
  msg ID TEXT...            send a text message
  say TEXT | shout TEXT     talk out loud to whoever is near you
  whisper ID TEXT           say something only one person beside you hears
  tip ID DOLLARS            tip someone you're with

Make your own character:
  options                   what the character creator offers
  create                    guided character creation (interactive)
  create FILE.json          create from a character sheet file
  play                      (no id) play your own character

Music:
  song new BPM TITLE        start a new song (60-200 bpm)
  song track INST NOTES...  add a track, e.g. song track piano C4:0:4 E4:4:4 G4:8:8
                            drums: song track drums kick:0,8 snare:4,12 hat:0,2,4,6,8,10,12,14
                            NOTE:STEPS[:LENGTH[:VELOCITY]], 16 steps per bar
  song repeat TIMES         repeat what you've written so far (up to 16 bars)
  song show | song save     review / save the song (saves to your phone's studio)
  song file FILE.json       save a song written as JSON
  song list                 your songs, the town chart, and instruments
  song release ID|last      publish a song to the town (can't be edited after)
  song play ID              listen to a released song
  song export ID|last FILE.mid   write a MIDI file you can play in any music app
  perform ID|last           perform live on a stage (open mic, church, park, club)
Things you own and getting around:
  use ITEM                  use something you have (headphones, a laptop, medicine, a test)
  wear ITEM | takeoff SLOT  put on clothes or an accessory / take off your outfit or accessory
  give ID ITEM              give something to someone you're with
  ride STOP [nopay]         take the bus from the stop you're at (phone transit lists stops)

School and work:
  enroll PROGRAM | drop     enroll at a campus (phone school lists programs) / drop out
  study start | study end   a study session (tuition by the hour, a grade from how you're doing)
  apply CAREER              apply in person at a workplace (phone jobs lists them)

On the wrong side of the law:
  steal OFFER               take something from a shop without paying
  pickpocket ID             lift cash from someone right next to you
  arrest ID                 police on duty: arrest someone with a warrant

Romance and family (adults only; every step needs the other person's yes):
  ask date|kiss|propose|marry|intimacy ID [protected]
  answer REQUEST yes|no     answer an ask
  breakup ID                end it (divorce, if you're married)
  namebaby CHILD NAME       name your newborn (within a week)
  care CHILD ROUTINE        feed, bathe, play, story, homework, bedtime, talk (at home with them)
  enrol CHILD school|daycare|none   in person at Founders School or Little Sprouts
  hire ID                   hire a nanny (they answer with `answer`); `dismiss` lets them go

  skip MINUTES              advance world time (only on servers started with --dev)
  logout | quit
  raw JSON                  send a raw protocol request)";

// M0.8 commands, one block per feature (each block belongs to one feature; see docs/m08/).
// m08:homes help {
const char* kHelpHomes = "";
// } m08:homes

// m08:work help {
const char* kHelpWork = "";
// } m08:work

// m08:wallet help {
const char* kHelpWallet = R"(Wallet, coins and LivPay:
  wallet                    money, coins, your phone's battery, LivPay activity and coin packs
  store                     the coin shop: looks and status items for coins
  buycoins PRODUCT [RECEIPT]  buy a coin pack; the server verifies the receipt (test servers: a test receipt
                            is made for you; real store billing isn't connected yet)
  coinbuy ITEM              buy something in the coin shop with coins
  switchphone ITEM          switch to another phone you own (`use ITEM` does the same; cases too)
  livpay ID DOLLARS [NOTE]  send money with LivPay, bank to bank, anywhere
  tapride STOP              take the bus paying with your phone (LivPay)
  buy OFFER phone           tap your phone to pay in a shop (LivPay, from your bank))";

// Prints a wallet command's reply.
void printWalletReply(const std::string& cmd, const Json& d) {
  if (cmd == "wallet") {
    std::printf("  Cash %s   Bank %s   Coins %lld\n", money(d.value("cash_cents", 0LL)).c_str(),
                money(d.value("bank_cents", 0LL)).c_str(), d.value("coins", 0LL));
    const Json& p = d.value("phone", Json::object());
    if (p.contains("label")) {
      const std::string where = p.value("charging", "");
      std::printf("  Phone: %s, %d%% (%.1f h left)%s%s%s\n", p.value("label", "").c_str(), p.value("battery", 0),
                  p.value("hours_left", 0.0), p.value("low", false) ? " LOW" : "",
                  where.empty() ? "" : (", charging (" + where + ")").c_str(),
                  p.value("case", "").empty() ? "" : (", in a " + p.value("case", "")).c_str());
    }
    for (const auto& s : d.value("spare_phones", Json::array())) {
      std::string charges;
      for (const auto& b : s.value("battery", Json::array())) charges += (charges.empty() ? "" : ", ") + std::to_string(b.get<int>()) + "%";
      std::printf("  Spare: %s x%d (%s)\n", s.value("label", "").c_str(), s.value("count", 0), charges.c_str());
    }
    const Json& lp = d.value("livpay", Json::object());
    std::printf("  LivPay: %s sent today (limit %s), %d of %d transfers. %s\n", money(lp.value("sent_today_cents", 0LL)).c_str(),
                money(lp.value("daily_limit_cents", 0LL)).c_str(), lp.value("transfers_today", 0), lp.value("daily_transfers", 0),
                lp.value("protection", "").c_str());
    for (const auto& t : lp.value("recent", Json::array()))
      std::printf("    %s  %-8s %10s  %s\n", t.value("when", "").c_str(), t.value("what", "").c_str(),
                  money(t.value("amount_cents", 0LL)).c_str(), t.value("memo", "").c_str());
    std::printf("  Coin packs (%s):\n", d.value("payments", Json::object()).value("message", "").c_str());
    for (const auto& pack : d.value("coin_packs", Json::array()))
      std::printf("    %-20s %-18s %6lld coins  %s\n", pack.value("product_id", "").c_str(), pack.value("label", "").c_str(),
                  pack.value("coins", 0LL), pack.value("price", "").c_str());
  } else if (cmd == "store") {
    std::printf("  Coin shop. You have %lld coins. %s\n", d.value("coins", 0LL), d.value("rules", "").c_str());
    for (const auto& it : d.value("items", Json::array()))
      std::printf("    %-22s %-32s %5lld coins%s\n", it.value("item", "").c_str(), it.value("label", "").c_str(),
                  it.value("coin_price", 0LL), it.value("owned", 0) > 0 ? "  (owned)" : "");
    std::printf("  %s\n", d.value("payments", Json::object()).value("message", "").c_str());
  } else if (cmd == "buycoins") {
    std::printf("  ✓ %lld coins added%s. You have %lld coins.\n", d.value("coins_added", 0LL),
                d.value("test", false) ? " (test purchase: nothing was charged)" : "", d.value("coins", 0LL));
  } else if (cmd == "coinbuy") {
    std::printf("  ✓ Bought %s for %lld coins. %lld coins left.\n", d.value("label", "").c_str(), d.value("coin_price", 0LL),
                d.value("coins", 0LL));
  } else if (cmd == "switchphone") {
    std::printf("  ✓ Now using %s (%d%%).%s\n", d.value("label", "").c_str(), d.value("battery", 0),
                d.value("put_away", "").empty() ? "" : (" Put away your " + d.value("put_away", "") + ".").c_str());
  } else if (cmd == "livpay") {
    std::printf("  ✓ Sent %s to %s with LivPay. Bank %s\n", money(d.value("amount_cents", 0LL)).c_str(),
                d.value("name", "").c_str(), money(d.value("balance_cents", 0LL)).c_str());
  } else if (cmd == "tapride") {
    std::printf("  ✓ On the %s to %s, paid %s with LivPay (about %.0fs)\n", d.value("line", "").c_str(),
                d.value("to", "").c_str(), money(d.value("fare_cents", 0LL)).c_str(), d.value("eta_seconds", 0.0));
  }
}
// } m08:wallet

// m08:leisure help {
const char* kHelpLeisure = "";
// } m08:leisure

// m08:pets help {
const char* kHelpPets = "";
// } m08:pets

// m08:details help {
const char* kHelpDetails = "";
// } m08:details


// Returns false to quit.
bool runCommand(Client& c, const std::string& input) {
  std::istringstream in(input);
  std::string cmd;
  in >> cmd;
  if (cmd.empty() || cmd[0] == '#') return true;
  auto rest = [&]() {
    std::string r;
    std::getline(in, r);
    const auto b = r.find_first_not_of(' ');
    return b == std::string::npos ? std::string() : r.substr(b);
  };
  auto arg = [&]() {
    std::string a;
    in >> a;
    return a;
  };

  Json req;
  if (cmd == "help") {
    std::printf("%s\n", kHelp);
    for (const char* more : {kHelpHomes, kHelpWork, kHelpWallet, kHelpLeisure, kHelpPets, kHelpDetails}) {
      if (*more) std::printf("%s\n", more);
    }
    return true;
  } else if (cmd == "quit") {
    return false;
  } else if (cmd == "wait") {
    drainEvents(c, std::stod(arg()));
    return true;
  } else if (cmd == "register" || cmd == "login") {
    const std::string u = arg();
    req = {{"op", cmd}, {"username", u}, {"password", arg()}};
  } else if (cmd == "characters") {
    req = {{"op", "characters"}};
  } else if (cmd == "play") {
    const std::string who = arg();
    req = {{"op", "play"}};
    if (!who.empty()) req["character"] = who;
  } else if (cmd == "options") {
    if (auto o = callOk(c, {{"op", "creator_options"}})) {
      std::printf("  Why did you move to Livéra?\n");
      for (const auto& origin : (*o)["origins"])
        std::printf("    %-24s %-28s %s\n", origin.value("id", "").c_str(), origin.value("label", "").c_str(),
                    origin.value("description", "").c_str());
      std::printf("  Starting careers:");
      for (const auto& career : (*o)["careers"]) std::printf(" %s", career.value("id", "").c_str());
      std::printf("\n  Appearance:");
      for (const auto& [field, choice] : (*o)["appearance"].items()) std::printf(" %s(%zu)", field.c_str(), choice["options"].size());
      std::printf("\n  Full details: raw {\"op\": \"creator_options\"}\n");
    }
    return !c.failed;
  } else if (cmd == "create") {
    createCharacter(c, arg());
    return !c.failed;
  } else if (cmd == "song") {
    songCommand(c, in);
    return !c.failed;
  } else if (cmd == "perform") {
    const std::string id = arg();
    req = {{"op", "perform"}, {"song", id == "last" ? c.lastSongId : id}};
  } else if (cmd == "say" || cmd == "shout") {
    req = {{"op", "say"}, {"volume", cmd}, {"text", rest()}};
  } else if (cmd == "whisper") {
    const std::string to = arg();
    req = {{"op", "say"}, {"volume", "whisper"}, {"to", to}, {"text", rest()}};
  } else if (cmd == "tip") {
    const std::string to = arg();
    double dollars = 0;
    try {
      dollars = std::stod(arg());
    } catch (...) {
    }
    req = {{"op", "tip"}, {"to", to}, {"cents", std::llround(dollars * 100)}};
  } else if (cmd == "look" || cmd == "l") {
    req = {{"op", "look"}};
  } else if (cmd == "map") {
    req = {{"op", "map"}};
  } else if (cmd == "walk") {
    auto reply = request(c, {{"op", "move"}, {"location", arg()}});
    if (!reply) {
      c.failed = true;
      return false;
    }
    if (!reply->value("ok", false)) {
      c.lastRefused = true;
      const Json& e = (*reply)["error"];
      std::printf("  ✗ %s (%s)\n", e.value("message", "").c_str(), e.value("code", "").c_str());
      return true;
    }
    const double eta = (*reply)["data"].value("eta_seconds", 0.0);
    std::printf("  … walking (%.0fs)\n", eta);
    if (eta > 0 && !waitForEvent(c, "arrived", eta + 5)) std::printf("  ! didn't arrive\n");
    return true;
  } else if (cmd == "go") {
    req = {{"op", "move"}, {"location", arg()}};
  } else if (cmd == "move") {
    const double x = std::stod(arg());
    req = {{"op", "move"}, {"x", x}, {"y", std::stod(arg())}};
  } else if (cmd == "enter") {
    req = {{"op", "enter"}, {"location", arg()}};
  } else if (cmd == "exit") {
    req = {{"op", "exit"}};
  } else if (cmd == "talk") {
    const std::string target = arg();
    std::string kind = arg();
    req = {{"op", "interact"}, {"target", target}, {"interaction", kind.empty() ? "chat" : kind}};
  } else if (cmd == "buy") {
    const std::string offer = arg();
    std::string method = arg();
    req = {{"op", "buy"}, {"offer", offer}, {"method", method.empty() ? "card" : method}};
  } else if (cmd == "do") {
    req = {{"op", "activity"}, {"activity", arg()}};
  } else if (cmd == "work") {
    req = {{"op", "work"}, {"action", arg()}};
  } else if (cmd == "phone") {
    req = {{"op", "phone"}, {"app", arg()}};
  } else if (cmd == "msg") {
    const std::string to = arg();
    req = {{"op", "message"}, {"to", to}, {"text", rest()}};
  } else if (cmd == "use") {
    req = {{"op", "use"}, {"item", arg()}};
  } else if (cmd == "wear") {
    req = {{"op", "wear"}, {"item", arg()}};
  } else if (cmd == "takeoff") {
    req = {{"op", "take_off"}, {"slot", arg()}};
  } else if (cmd == "give") {
    const std::string to = arg();
    req = {{"op", "give"}, {"to", to}, {"item", arg()}};
  } else if (cmd == "ride") {
    const std::string stop = arg();
    req = {{"op", "ride"}, {"to", stop}, {"pay", arg() != "nopay"}};
  } else if (cmd == "enroll") {
    req = {{"op", "enroll"}, {"program", arg()}};
  } else if (cmd == "drop") {
    req = {{"op", "enroll"}, {"program", ""}};
  } else if (cmd == "study") {
    req = {{"op", "study"}, {"action", arg()}};
  } else if (cmd == "apply") {
    req = {{"op", "apply"}, {"career", arg()}};
  } else if (cmd == "steal") {
    req = {{"op", "steal"}, {"offer", arg()}};
  } else if (cmd == "pickpocket") {
    req = {{"op", "pickpocket"}, {"target", arg()}};
  } else if (cmd == "arrest") {
    req = {{"op", "arrest"}, {"target", arg()}};
  } else if (cmd == "ask") {
    const std::string kind = arg();
    const std::string target = arg();
    req = {{"op", "request"}, {"kind", kind}, {"target", target}, {"protection", arg() == "protected"}};
  } else if (cmd == "answer") {
    const std::string id = arg();
    req = {{"op", "respond"}, {"request", id}, {"accept", arg() == "yes"}};
  } else if (cmd == "breakup") {
    req = {{"op", "end_relationship"}, {"target", arg()}};
  } else if (cmd == "namebaby") {
    const std::string child = arg();
    req = {{"op", "name_baby"}, {"child", child}, {"name", rest()}};
  } else if (cmd == "care") {
    const std::string child = arg();
    req = {{"op", "care"}, {"child", child}, {"action", arg()}};
  } else if (cmd == "enrol" || cmd == "enroll_child") {
    const std::string child = arg();
    const std::string where = arg();
    req = {{"op", "enroll_child"}, {"child", child}, {"where", where == "none" ? "" : where}};
  } else if (cmd == "hire") {
    req = {{"op", "hire_nanny"}, {"target", arg()}};
  } else if (cmd == "dismiss") {
    req = {{"op", "dismiss_nanny"}};
    // m08:homes commands { Buying homes, mortgages, moving in together (Homes.cpp)
    // } m08:homes

    // m08:work commands { Work decisions during shifts (WorkTasks.cpp)
    // } m08:work

    // m08:wallet commands { Coins, phones and LivPay (Wallet.cpp)
  } else if (cmd == "wallet" || cmd == "store" || cmd == "buycoins" || cmd == "coinbuy" || cmd == "switchphone" ||
             cmd == "livpay" || cmd == "tapride") {
    Json walletReq;
    if (cmd == "wallet" || cmd == "store") {
      walletReq = {{"op", "phone"}, {"app", cmd}};
    } else if (cmd == "buycoins") {
      const std::string product = arg();
      std::string receipt = arg();
      // The CLI has no app store: it makes a test receipt, which only a test-payments server accepts.
      if (receipt.empty())
        receipt = "test-cli-" + std::to_string(std::chrono::duration_cast<std::chrono::milliseconds>(
                                                   std::chrono::system_clock::now().time_since_epoch())
                                                   .count());
      walletReq = {{"op", "buy_coins"}, {"product", product}, {"receipt", receipt}};
    } else if (cmd == "coinbuy") {
      walletReq = {{"op", "buy_with_coins"}, {"item", arg()}};
    } else if (cmd == "switchphone") {
      walletReq = {{"op", "switch_phone"}, {"item", arg()}};
    } else if (cmd == "livpay") {
      const std::string to = arg();
      double dollars = 0;
      try {
        dollars = std::stod(arg());
      } catch (...) {
      }
      walletReq = {{"op", "livpay_send"}, {"to", to}, {"cents", std::llround(dollars * 100)}, {"note", rest()}};
    } else {
      walletReq = {{"op", "ride"}, {"to", arg()}, {"pay", true}, {"pay_with", "phone"}};
    }
    auto walletReply = request(c, walletReq);
    if (!walletReply) {
      c.failed = true;
      return false;
    }
    if (!walletReply->value("ok", false)) {
      c.lastRefused = true;
      const Json& e = (*walletReply)["error"];
      std::printf("  ✗ %s (%s)\n", e.value("message", "").c_str(), e.value("code", "").c_str());
      return true;
    }
    printWalletReply(cmd, (*walletReply)["data"]);
    return true;
    // } m08:wallet

    // m08:leisure commands { Sports, date spots and the lake park (Leisure.cpp)
    // } m08:leisure

    // m08:pets commands { Pets and medicine (Pets.cpp)
    // } m08:pets

    // m08:details commands { Accidents as a big deal, laundry, weather, birthdays, hangovers (Details.cpp)
    // } m08:details
  } else if (cmd == "skip") {
    req = {{"op", "dev_advance"}, {"minutes", std::stoll(arg())}};
  } else if (cmd == "logout") {
    req = {{"op", "logout"}};
  } else if (cmd == "raw") {
    req = Json::parse(rest(), nullptr, false);
    if (!req.is_object()) {
      std::printf("  ! not a JSON object\n");
      return true;
    }
  } else {
    std::printf("  unknown command '%s' (try help)\n", cmd.c_str());
    return true;
  }

  auto reply = request(c, req);
  if (!reply) {
    c.failed = true;
    return false;
  }
  if (!reply->value("ok", false)) {
    c.lastRefused = true;
    const Json& e = (*reply)["error"];
    std::printf("  ✗ %s (%s)\n", e.value("message", "").c_str(), e.value("code", "").c_str());
    return true;
  }
  const Json& d = (*reply)["data"];
  const std::string op = req.value("op", "");
  if ((op == "look" || op == "play" || op == "enter") && d.contains("you")) printLook(d);
  else if (op == "phone" && req.value("app", "") == "bank") printBank(d);
  else if (op == "buy")
    std::printf("  ✓ Bought %s for %s. Balance %s\n", d.value("item", "").c_str(), money(d.value("price_cents", 0LL)).c_str(),
                money(d.value("balance_cents", 0LL)).c_str());
  else if (op == "work" && d.contains("pay_cents")) {
    std::printf("  ✓ Shift over: %lld minutes, paid %s, performance %.0f\n", d.value("minutes_worked", 0LL),
                money(d.value("pay_cents", 0LL)).c_str(), d.value("performance", 0.0));
    if (d.contains("promoted_to")) std::printf("  ★ Promoted to %s\n", d.value("promoted_to", "").c_str());
  } else if (op == "login") {
    c.myCharacter = d.value("character", Json()).is_string() ? d["character"].get<std::string>() : "";
    std::printf("  ✓ Logged in.%s\n", c.myCharacter.empty() ? " Type `characters` to pick one, or `create` to make your own."
                                                             : (" Your character: " + c.myCharacter + ". Type `play`.").c_str());
  } else if (op == "characters") {
    for (const auto& ch : d["characters"]) {
      std::printf("  %-14s %s, %d (%s)%s%s\n", ch.value("id", "").c_str(), ch.value("name", "").c_str(), ch.value("age", 0),
                  ch.value("pronouns", "").c_str(), ch.contains("career") ? (", " + ch.value("career", "")).c_str() : "",
                  ch.value("available", false) ? "" : "  [taken]");
      if (!ch.value("tagline", "").empty()) std::printf("                 %s\n", ch.value("tagline", "").c_str());
    }
    if (d.value("can_create", false)) std::printf("  ...or make your own: `create`\n");
  } else if (op == "say") {
    std::printf("  ✓ (heard by %d)\n", d.value("heard_by", 0));
  } else if (op == "tip") {
    std::printf("  ✓ Tipped %s. Balance %s\n", money(d.value("amount_cents", 0LL)).c_str(), money(d.value("balance_cents", 0LL)).c_str());
  } else if (op == "perform") {
    std::printf("  ♪ You performed \"%s\": quality %.0f, audience %d, music skill now %.1f\n", d.value("song", "").c_str(),
                d.value("quality", 0.0), d.value("audience", 0), d.value("music_skill", 0.0));
  } else if (op == "interact") {
    std::printf("  ✓ %s%s. They seem %s.\n", d.value("interaction", "").c_str(),
                d.value("first_meeting", false) ? " (first meeting)" : "", d.value("reaction", "").c_str());
  } else std::printf("  ✓ %s\n", d.dump(2).c_str());
  return true;
}

}  // namespace

int main(int argc, char** argv) {
  std::string host = "127.0.0.1";
  int port = 7777;
  std::string script;
  Client client;
  for (int i = 1; i < argc; ++i) {
    const std::string a = argv[i];
    if (a == "--host" && i + 1 < argc) host = argv[++i];
    else if (a == "--port" && i + 1 < argc) port = std::stoi(argv[++i]);
    else if (a == "--script" && i + 1 < argc) script = argv[++i];
    else if (a == "--quiet-events") client.quietEvents = true;
    else {
      std::fprintf(stderr, "usage: livera_cli [--host H] [--port P] [--script FILE] [--quiet-events]\n");
      return 2;
    }
  }
  auto fd = net::connectTcp(host, static_cast<std::uint16_t>(port));
  if (!fd) {
    std::fprintf(stderr, "livera_cli: %s\n", fd.error().message.c_str());
    return 1;
  }
  client.fd = std::move(fd).value();
  drainEvents(client, 0.2);  // welcome

  if (!script.empty()) {
    std::ifstream in(script);
    if (!in) {
      std::fprintf(stderr, "livera_cli: cannot read %s\n", script.c_str());
      return 1;
    }
    std::string line;
    bool expectRefusal = false;
    while (std::getline(in, line)) {
      if (line.empty()) continue;
      if (line.rfind("#!expect-refusal", 0) == 0) {  // the next command must be refused by the server
        expectRefusal = true;
        continue;
      }
      if (line[0] == '#') continue;
      std::printf("> %s\n", line.c_str());
      client.lastRefused = false;
      if (!runCommand(client, line)) break;
      if (client.lastRefused != expectRefusal) {
        std::printf(expectRefusal ? "  ! expected the server to refuse that\n" : "  ! unexpected refusal\n");
        client.failed = true;
      }
      expectRefusal = false;
    }
    return client.failed ? 1 : 0;
  }

  client.interactive = true;
  std::printf("Connected to LIVÉRA at %s:%d. Type `help`.\n", host.c_str(), port);
  for (;;) {
    std::printf("> ");
    std::fflush(stdout);
    // Wait for either typed input or server events.
    for (;;) {
      pollfd fds[2] = {{STDIN_FILENO, POLLIN, 0}, {client.fd.get(), POLLIN, 0}};
      ::poll(fds, 2, -1);
      if (fds[1].revents & POLLIN) {
        drainEvents(client, 0.05);
        std::printf("> ");
        std::fflush(stdout);
      }
      if (fds[0].revents & (POLLIN | POLLHUP)) break;
    }
    std::string line;
    if (!std::getline(std::cin, line)) break;
    if (!runCommand(client, line)) break;
  }
  return 0;
}
