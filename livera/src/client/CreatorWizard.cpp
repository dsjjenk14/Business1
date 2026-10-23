#include "client/CreatorWizard.h"

#include <algorithm>
#include <cctype>
#include <cstdio>
#include <stdexcept>
#include <string>
#include <iostream>
#include <sstream>

namespace livera::client {

namespace {

std::string ask(const std::string& prompt) {
  std::printf("%s", prompt.c_str());
  std::fflush(stdout);
  std::string line;
  if (!std::getline(std::cin, line)) throw std::runtime_error("input ended");
  const auto b = line.find_first_not_of(" \t");
  if (b == std::string::npos) return "";
  return line.substr(b, line.find_last_not_of(" \t\r") - b + 1);
}

void listOptions(const Json& options) {
  int i = 1;
  std::string row;
  for (const auto& o : options) {
    char cell[48];
    std::snprintf(cell, sizeof cell, "%3d) %-22s", i++, o.get<std::string>().c_str());
    row += cell;
    if ((i - 1) % 3 == 0) {
      std::printf("%s\n", row.c_str());
      row.clear();
    }
  }
  if (!row.empty()) std::printf("%s\n", row.c_str());
}

// One pick by number (or typed text when custom answers are allowed).
std::string pickOne(const std::string& title, const Json& choice) {
  const Json& options = choice.is_array() ? choice : choice.at("options");
  const bool custom = choice.is_object() && choice.value("allow_custom", false);
  std::printf("\n%s\n", title.c_str());
  listOptions(options);
  for (;;) {
    const std::string a = ask(custom ? "  number, or type your own: " : "  number: ");
    try {
      const int n = std::stoi(a);
      if (n >= 1 && n <= static_cast<int>(options.size())) return options[n - 1].get<std::string>();
    } catch (...) {
      if (custom && !a.empty()) return a;
    }
    std::printf("  pick one of the numbers above\n");
  }
}

// Several picks: comma-separated numbers.
Json pickMany(const std::string& title, const Json& choice) {
  const Json& options = choice.at("options");
  const int min = choice.value("min", 1);
  const int max = choice.value("max", 1);
  std::printf("\n%s (pick %d-%d, comma-separated%s)\n", title.c_str(), min, max, min == 0 ? ", or Enter for none" : "");
  listOptions(options);
  for (;;) {
    const std::string a = ask("  numbers: ");
    Json picks = Json::array();
    bool ok = true;
    std::istringstream in(a);
    std::string part;
    while (std::getline(in, part, ',')) {
      try {
        const int n = std::stoi(part);
        if (n < 1 || n > static_cast<int>(options.size())) ok = false;
        else if (std::find(picks.begin(), picks.end(), options[n - 1]) == picks.end()) picks.push_back(options[n - 1]);
      } catch (...) {
        ok = false;
      }
    }
    if (ok && static_cast<int>(picks.size()) >= min && static_cast<int>(picks.size()) <= max) return picks;
    std::printf("  pick %d to %d of the numbers above\n", min, max);
  }
}

int askInt(const std::string& prompt, int lo, int hi) {
  for (;;) {
    try {
      const int n = std::stoi(ask(prompt));
      if (n >= lo && n <= hi) return n;
    } catch (...) {
    }
    std::printf("  enter a number from %d to %d\n", lo, hi);
  }
}

// Personality or values: keep everything at 50, or set each, within a point budget.
Json allocate(const std::string& title, const Json& stats, double budget) {
  Json out = Json::object();
  for (const auto& s : stats) out[s.get<std::string>()] = 50;
  std::printf("\n%s: %zu stats, %.0f points to spend (0-100 each).\n", title.c_str(), stats.size(), budget);
  const std::string a = ask("  keep everything balanced at 50? [Y/n] ");
  if (a.empty() || a[0] == 'y' || a[0] == 'Y') return out;
  for (;;) {
    double left = budget;
    for (const auto& s : stats) {
      const std::string name = s.get<std::string>();
      char prompt[96];
      std::snprintf(prompt, sizeof prompt, "  %-16s (%.0f points left): ", name.c_str(), left);
      const int v = askInt(prompt, 0, 100);
      out[name] = v;
      left -= v;
    }
    if (left >= 0) return out;
    std::printf("  that's %.0f over budget; try again\n", -left);
  }
}

}  // namespace

std::optional<Json> runCreatorWizard(const Json& o) {
  try {
    std::printf("\nWelcome to Livéra. Let's make you.\n");
    Json sheet = Json::object();
    sheet["first_name"] = ask("\nFirst name: ");
    sheet["last_name"] = ask("Last name: ");
    sheet["age"] = askInt("Age (" + std::to_string(o["age"][0].get<int>()) + "-" + std::to_string(o["age"][1].get<int>()) + "): ",
                          o["age"][0].get<int>(), o["age"][1].get<int>());
    sheet["pronouns"] = pickOne("Pronouns", o["pronouns"]);
    sheet["gender"] = pickOne("Gender", o["gender"]);

    Json look = Json::object();
    for (const auto& [field, choice] : o["appearance"].items()) {
      std::string title = field;
      for (auto& ch : title) ch = ch == '_' ? ' ' : ch;
      title[0] = static_cast<char>(std::toupper(static_cast<unsigned char>(title[0])));
      look[field] = choice.value("max", 1) == 1 ? Json(pickOne(title, choice)) : pickMany(title, choice);
    }
    look["height_cm"] = askInt("\nHeight in cm (" + std::to_string(o["height_cm"][0].get<int>()) + "-" +
                                   std::to_string(o["height_cm"][1].get<int>()) + "): ",
                               o["height_cm"][0].get<int>(), o["height_cm"][1].get<int>());
    sheet["appearance"] = look;

    sheet["personality"] = allocate("Personality", o["personality"], o["personality_budget"].get<double>());
    sheet["values"] = allocate("What matters to you", o["values"], o["values_budget"].get<double>());
    sheet["traits"] = pickMany("Traits", o["traits"]);
    sheet["interests"] = pickMany("Interests", o["interests"]);
    sheet["education"] = pickOne("Education", o["education"]);
    sheet["relationship_status"] = pickOne("Relationship status", o["relationship_status"]);
    sheet["goals"] = pickMany("Goals", o["goals"]);

    std::printf("\nWhy did you move to Livéra?\n");
    int i = 1;
    for (const auto& origin : o["origins"]) {
      std::printf("  %2d) %-28s %s\n", i++, origin.value("label", "").c_str(), origin.value("description", "").c_str());
    }
    sheet["origin"] = o["origins"][askInt("  number: ", 1, static_cast<int>(o["origins"].size())) - 1]["id"];

    // Only the jobs your education qualifies you for (the server applies the same rule as `apply`).
    Json open = Json::array();
    for (const auto& c : o["careers"]) {
      const Json educations = c.value("educations", Json::array());
      const bool qualifies = std::find(educations.begin(), educations.end(), sheet["education"]) != educations.end();
      if (!c.contains("educations") || qualifies) open.push_back(c);
    }
    if (open.empty()) open = o["careers"];
    std::printf("\nStarting career\n");
    i = 1;
    for (const auto& c : open) {
      std::printf("  %2d) %-26s starts as %s ($%.2f/hr)\n", i++, c.value("name", "").c_str(),
                  c.value("starting_title", "").c_str(), c.value("hourly_cents", 0) / 100.0);
    }
    sheet["career"] = open[askInt("  number: ", 1, static_cast<int>(open.size())) - 1]["id"];
    sheet["background"] = ask("\nA line or two about your past (optional): ");
    return sheet;
  } catch (const std::exception&) {
    std::printf("\n  character creation cancelled\n");
    return std::nullopt;
  }
}

}  // namespace livera::client
