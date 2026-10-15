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
  phone APP                 bank, messages, contacts, calendar, map, career, property, notifications, city
  msg ID TEXT...            send a text message
  skip MINUTES              advance world time (only on servers started with --dev)
  logout | quit
  raw JSON                  send a raw protocol request)";

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
    req = {{"op", "play"}, {"character", arg()}};
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
