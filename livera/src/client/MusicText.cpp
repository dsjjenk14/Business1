#include "client/MusicText.h"

#include <algorithm>
#include <cctype>
#include <fstream>
#include <map>
#include <sstream>
#include <vector>

namespace livera::client {

namespace {

const std::map<std::string, int>& drumNames() {
  static const std::map<std::string, int> names = {
      {"kick", 36},     {"kick2", 35},   {"rim", 37},      {"snare", 38},   {"clap", 39},
      {"snare2", 40},   {"tom_low", 45}, {"tom_mid", 47},  {"tom_high", 50}, {"hat", 42},
      {"pedal_hat", 44}, {"open_hat", 46}, {"crash", 49},  {"ride", 51},    {"tamb", 54},
      {"cowbell", 56},  {"conga", 63},   {"shaker", 70}};
  return names;
}

std::optional<int> parsePitch(const std::string& s, bool drums) {
  if (s.empty()) return std::nullopt;
  if (std::all_of(s.begin(), s.end(), [](unsigned char c) { return std::isdigit(c); })) return std::stoi(s);
  if (drums) {
    auto it = drumNames().find(s);
    if (it != drumNames().end()) return it->second;
    return std::nullopt;
  }
  static const int semis[] = {9, 11, 0, 2, 4, 5, 7};  // A B C D E F G
  const char letter = static_cast<char>(std::toupper(static_cast<unsigned char>(s[0])));
  if (letter < 'A' || letter > 'G') return std::nullopt;
  int semitone = semis[letter - 'A'];
  std::size_t i = 1;
  if (i < s.size() && s[i] == '#') ++semitone, ++i;
  else if (i < s.size() && s[i] == 'b') --semitone, ++i;
  if (i >= s.size()) return std::nullopt;
  try {
    std::size_t used = 0;
    const int octave = std::stoi(s.substr(i), &used);
    if (i + used != s.size()) return std::nullopt;
    return 12 * (octave + 1) + semitone;  // C4 = 60
  } catch (...) {
    return std::nullopt;
  }
}

std::vector<std::string> split(const std::string& s, char sep) {
  std::vector<std::string> out;
  std::string part;
  std::istringstream in(s);
  while (std::getline(in, part, sep)) out.push_back(part);
  return out;
}

void put16(std::string& o, int v) {
  o.push_back(static_cast<char>((v >> 8) & 0xFF));
  o.push_back(static_cast<char>(v & 0xFF));
}

void put32(std::string& o, std::uint32_t v) {
  for (int shift = 24; shift >= 0; shift -= 8) o.push_back(static_cast<char>((v >> shift) & 0xFF));
}

void putVarLen(std::string& o, std::uint32_t v) {
  char bytes[5];
  int n = 0;
  bytes[n++] = static_cast<char>(v & 0x7F);
  while (v >>= 7) bytes[n++] = static_cast<char>((v & 0x7F) | 0x80);
  while (n) o.push_back(bytes[--n]);
}

void putMeta(std::string& o, int type, const std::string& data) {
  o.push_back('\0');  // delta 0
  o.push_back(static_cast<char>(0xFF));
  o.push_back(static_cast<char>(type));
  putVarLen(o, static_cast<std::uint32_t>(data.size()));
  o += data;
}

std::string chunk(const char* id, const std::string& body) {
  std::string out(id, 4);
  put32(out, static_cast<std::uint32_t>(body.size()));
  return out + body;
}

}  // namespace

Result<Json> parseNotes(const std::string& text, bool drums) {
  Json notes = Json::array();
  std::istringstream in(text);
  std::string token;
  while (in >> token) {
    const auto parts = split(token, ':');
    if (parts.size() < 2 || parts.size() > 4) return fail("bad_notes", "'" + token + "': use NOTE:STEPS[:LENGTH[:VELOCITY]]");
    const auto pitch = parsePitch(parts[0], drums);
    if (!pitch) return fail("bad_notes", "'" + parts[0] + "' isn't a note" + (drums ? " or drum name" : ""));
    int length = drums ? 1 : 2;
    int velocity = 100;
    try {
      if (parts.size() > 2) length = std::stoi(parts[2]);
      if (parts.size() > 3) velocity = std::stoi(parts[3]);
      for (const auto& step : split(parts[1], ',')) notes.push_back({std::stoi(step), *pitch, length, velocity});
    } catch (...) {
      return fail("bad_notes", "'" + token + "': steps, length and velocity are numbers");
    }
  }
  if (notes.empty()) return fail("bad_notes", "no notes given");
  return notes;
}

Status writeMidi(const Json& song, const Json& instruments, const std::string& path) {
  constexpr int kTicksPerBeat = 96;
  constexpr int kTicksPerStep = kTicksPerBeat / 4;
  std::vector<std::string> tracks;

  // Track 0: tempo, time signature, title.
  std::string conductor;
  putMeta(conductor, 0x03, song.value("title", "LIVÉRA song"));
  const int bpm = song.value("bpm", 100);
  const auto usPerBeat = static_cast<std::uint32_t>(60000000 / std::max(1, bpm));
  putMeta(conductor, 0x51, std::string{static_cast<char>((usPerBeat >> 16) & 0xFF), static_cast<char>((usPerBeat >> 8) & 0xFF),
                                       static_cast<char>(usPerBeat & 0xFF)});
  putMeta(conductor, 0x58, std::string{4, 2, 24, 8});
  putMeta(conductor, 0x2F, "");
  tracks.push_back(conductor);

  int nextChannel = 0;
  for (const auto& t : song.at("tracks")) {
    const std::string instId = t.value("instrument", "");
    const Json inst = instruments.contains(instId) ? instruments.at(instId) : Json::object();
    const bool drums = inst.value("drums", false);
    int channel = 9;
    if (!drums) {
      if (nextChannel == 9) ++nextChannel;
      channel = nextChannel++ % 16;
    }
    struct Ev {
      std::uint32_t tick;
      int order;  // note-offs before note-ons at the same tick
      unsigned char status, a, b;
    };
    std::vector<Ev> evs;
    for (const auto& n : t.at("notes")) {
      const auto start = static_cast<std::uint32_t>(n.at(0).get<int>() * kTicksPerStep);
      const auto end = start + static_cast<std::uint32_t>(n.at(2).get<int>() * kTicksPerStep) - 1;
      const auto pitch = static_cast<unsigned char>(n.at(1).get<int>());
      const auto vel = static_cast<unsigned char>(n.size() > 3 ? n.at(3).get<int>() : 100);
      evs.push_back({start, 1, static_cast<unsigned char>(0x90 | channel), pitch, vel});
      evs.push_back({end, 0, static_cast<unsigned char>(0x80 | channel), pitch, 0});
    }
    std::stable_sort(evs.begin(), evs.end(),
                     [](const Ev& x, const Ev& y) { return x.tick != y.tick ? x.tick < y.tick : x.order < y.order; });
    std::string body;
    putMeta(body, 0x03, inst.value("label", instId));
    if (!drums) {
      body.push_back('\0');
      body.push_back(static_cast<char>(0xC0 | channel));
      body.push_back(static_cast<char>(inst.value("midi_program", 0) & 0x7F));
    }
    std::uint32_t last = 0;
    for (const auto& e : evs) {
      putVarLen(body, e.tick - last);
      last = e.tick;
      body.push_back(static_cast<char>(e.status));
      body.push_back(static_cast<char>(e.a));
      body.push_back(static_cast<char>(e.b));
    }
    putMeta(body, 0x2F, "");
    tracks.push_back(body);
  }

  std::string header;
  put16(header, 1);
  put16(header, static_cast<int>(tracks.size()));
  put16(header, kTicksPerBeat);
  std::string file = chunk("MThd", header);
  for (const auto& t : tracks) file += chunk("MTrk", t);
  std::ofstream out(path, std::ios::binary);
  if (!out) return fail("io_error", "can't write " + path);
  out.write(file.data(), static_cast<std::streamsize>(file.size()));
  return out ? okStatus() : Status(fail("io_error", "write failed for " + path));
}

}  // namespace livera::client
