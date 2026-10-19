#include "core/Serialization.h"

#include <map>
#include <stdexcept>
#include <string>
#include <vector>

#include "core/Parts.h"

namespace livera {

Json toJson(const CharacterState& c) {
  Json j{{"id", c.id},
         {"position", {c.position.x, c.position.y}},
         {"inside", c.inside},
         {"needs", c.needs},
         {"emotions", c.emotions},
         {"last_simulated_at", c.lastSimulatedAt},
         {"rent_arrears_cents", c.rentArrearsCents},
         {"skills", c.skills}};
  Json career{{"career_id", c.career.careerId},
              {"level", c.career.level},
              {"hours_at_level", c.career.hoursAtLevel},
              {"performance", c.career.performance},
              {"lifetime_earnings_cents", c.career.lifetimeEarningsCents}};
  j["career"] = career;
  Json conditions = Json::array();
  for (const auto& k : c.conditions)
    conditions.push_back(Json{{"id", k.id}, {"since", k.since}, {"until", k.until}, {"diagnosed", k.diagnosed}, {"recovery", k.recovery}});
  j["body"] = Json{{"born_at", c.bornAt},
                   {"calendar", true},  // ages follow the calendar (M0.8); older saves counted 1800 days a year
                   {"last_birthday_age", c.lastBirthdayAge},
                   {"height_cm", c.heightCm},
                   {"weight_kg", c.weightKg},
                   {"calories_in", c.caloriesIn},
                   {"calories_out", c.caloriesOut}};
  j["conditions"] = conditions;
  j["last_online_at"] = c.lastOnlineAt;
  j["inventory"] = c.inventory;
  j["outfit"] = c.outfit;
  j["accessory"] = c.accessory;
  Json record = Json::array();
  for (const auto& e : c.record)
    record.push_back(Json{{"crime", e.crime}, {"at", e.at}, {"fine_cents", e.fineCents}, {"jail_minutes", e.jailMinutes}});
  j["record"] = record;
  j["dependency"] = c.dependency;
  j["high_on"] = c.highOn;
  j["high_until"] = c.highUntil;
  j["wanted_for"] = c.wantedFor;
  j["jailed_until"] = c.jailedUntil;
  j["fame"] = c.fame;
  j["parents"] = c.parents;
  j["childhood"] = Json{{"childcare", c.childcare},
                        {"school_grade_sum", c.schoolGradeSum},
                        {"school_days", c.schoolDays},
                        {"school_bonus_today", c.schoolBonusToday},
                        {"unsupervised_hours_today", c.unsupervisedHoursToday},
                        {"childcare_payer", c.childcarePayer},
                        {"childcare_paid_day", c.childcarePaidDay}};
  j["nanny_for"] = c.nannyFor;
  if (c.pregnancy) {
    const PregnancyState& p = *c.pregnancy;
    j["pregnancy"] = Json{{"partner", p.partner}, {"conceived_at", p.conceivedAt}, {"due_at", p.dueAt}, {"known", p.known},
                          {"prenatal_visits", p.prenatalVisits}, {"risk", p.risk}};
  }
  j["education"] = Json{{"program", c.education.program},
                        {"hours", c.education.hours},
                        {"grade_sum", c.education.gradeSum},
                        {"sessions", c.education.sessions},
                        {"degrees", c.education.degrees}};
  // M0.8 features write their own keys.
  writeHomesCharacter(c, j);
  writeWorkCharacter(c, j);
  writeWalletCharacter(c, j);
  writeLeisureCharacter(c, j);
  writePetsCharacter(c, j);
  writeDetailsCharacter(c, j);
  // Online state, move targets and in-progress shifts are session state: a saved
  // character always loads offline, standing still, off shift (shifts are settled on logout).
  return j;
}

CharacterState characterStateFromJson(const Json& j) {
  CharacterState c;
  c.id = j.at("id").get<std::string>();
  c.position = Vec2{j.at("position").at(0).get<double>(), j.at("position").at(1).get<double>()};
  c.inside = j.value("inside", "");
  c.needs = j.at("needs").get<StatMap>();
  c.emotions = j.at("emotions").get<StatMap>();
  c.lastSimulatedAt = j.at("last_simulated_at").get<GameMinutes>();
  c.rentArrearsCents = j.value("rent_arrears_cents", Cents{0});
  c.skills = j.value("skills", StatMap{});
  const Json& career = j.at("career");
  c.career.careerId = career.at("career_id").get<std::string>();
  c.career.level = career.at("level").get<int>();
  c.career.hoursAtLevel = career.at("hours_at_level").get<double>();
  c.career.performance = career.at("performance").get<double>();
  c.career.lifetimeEarningsCents = career.at("lifetime_earnings_cents").get<Cents>();
  // Saves from before the life update have no body yet; World fills it in from the definition.
  if (j.contains("body")) {
    const Json& b = j.at("body");
    c.bornAt = b.value("born_at", GameMinutes{0});
    c.rebaseAge = !b.value("calendar", false);
    c.lastBirthdayAge = b.value("last_birthday_age", 0);
    c.heightCm = b.value("height_cm", 170.0);
    c.weightKg = b.value("weight_kg", 0.0);
    c.caloriesIn = b.value("calories_in", 0.0);
    c.caloriesOut = b.value("calories_out", 0.0);
  }
  for (const auto& k : j.value("conditions", Json::array())) {
    c.conditions.push_back(ConditionState{k.at("id").get<std::string>(), k.at("since").get<GameMinutes>(),
                                          k.at("until").get<GameMinutes>(), k.value("diagnosed", false),
                                          k.value("recovery", 0.0)});
  }
  c.lastOnlineAt = j.value("last_online_at", GameMinutes{-1});
  c.inventory = j.value("inventory", std::map<std::string, int>{});
  c.outfit = j.value("outfit", "");
  c.accessory = j.value("accessory", "");
  for (const auto& e : j.value("record", Json::array()))
    c.record.push_back(CrimeRecordEntry{e.at("crime").get<std::string>(), e.at("at").get<GameMinutes>(),
                                        e.value("fine_cents", Cents{0}), e.value("jail_minutes", GameMinutes{0})});
  c.dependency = j.value("dependency", StatMap{});
  c.highOn = j.value("high_on", "");
  c.highUntil = j.value("high_until", GameMinutes{-1});
  c.wantedFor = j.value("wanted_for", "");
  c.jailedUntil = j.value("jailed_until", GameMinutes{-1});
  c.fame = j.value("fame", -1.0);  // -1: a save from before fame; World starts it from the definition
  c.parents = j.value("parents", std::vector<std::string>{});
  if (j.contains("childhood")) {
    const Json& k = j.at("childhood");
    c.childcare = k.value("childcare", "");
    c.schoolGradeSum = k.value("school_grade_sum", 0.0);
    c.schoolDays = k.value("school_days", 0);
    c.schoolBonusToday = k.value("school_bonus_today", 0.0);
    c.unsupervisedHoursToday = k.value("unsupervised_hours_today", 0.0);
    c.childcarePayer = k.value("childcare_payer", "");
    c.childcarePaidDay = k.value("childcare_paid_day", std::int64_t{-1});
  }
  c.nannyFor = j.value("nanny_for", "");
  if (j.contains("pregnancy")) {
    const Json& p = j.at("pregnancy");
    c.pregnancy = PregnancyState{p.at("partner").get<std::string>(), p.at("conceived_at").get<GameMinutes>(),
                                 p.at("due_at").get<GameMinutes>(), p.value("known", false), p.value("prenatal_visits", 0),
                                 p.value("risk", 1.0)};
  }
  if (j.contains("education")) {
    const Json& e = j.at("education");
    c.education.program = e.value("program", "");
    c.education.hours = e.value("hours", 0.0);
    c.education.gradeSum = e.value("grade_sum", 0.0);
    c.education.sessions = e.value("sessions", 0);
    c.education.degrees = e.value("degrees", std::vector<std::string>{});
  }
  readHomesCharacter(c, j);
  readWorkCharacter(c, j);
  readWalletCharacter(c, j);
  readLeisureCharacter(c, j);
  readPetsCharacter(c, j);
  readDetailsCharacter(c, j);
  return c;
}

Json toJson(const RelationshipState& r) {
  return Json{{"dimensions", r.dimensions},
              {"status", r.status},
              {"status_since", r.statusSince},
              {"first_met_at", r.firstMetAt},
              {"last_interaction_at", r.lastInteractionAt},
              {"interaction_count", r.interactionCount}};
}

RelationshipState relationshipStateFromJson(const Json& j) {
  RelationshipState r;
  r.dimensions = j.at("dimensions").get<StatMap>();
  r.status = j.value("status", "");
  r.statusSince = j.value("status_since", GameMinutes{-1});
  r.firstMetAt = j.at("first_met_at").get<GameMinutes>();
  r.lastInteractionAt = j.at("last_interaction_at").get<GameMinutes>();
  r.interactionCount = j.at("interaction_count").get<int>();
  return r;
}

Json toJson(const Memory& m) {
  return Json{{"id", m.id},
              {"owner", m.owner},
              {"at", m.at},
              {"participants", m.participants},
              {"location", m.location},
              {"type", m.type},
              {"emotional_impact", m.emotionalImpact},
              {"importance", m.importance},
              {"about", m.about},
              {"info", m.info},
              {"public", m.isPublic}};
}

Memory memoryFromJson(const Json& j) {
  Memory m;
  m.id = j.at("id").get<std::string>();
  m.owner = j.at("owner").get<std::string>();
  m.at = j.at("at").get<GameMinutes>();
  m.participants = j.at("participants").get<std::vector<std::string>>();
  m.location = j.value("location", "");
  m.type = j.at("type").get<std::string>();
  m.emotionalImpact = j.at("emotional_impact").get<int>();
  m.importance = j.at("importance").get<int>();
  m.about = j.value("about", "");
  m.info = j.value("info", "");
  m.isPublic = j.value("public", false);
  return m;
}

Json toJson(const Song& s) {
  Json tracks = Json::array();
  for (const auto& t : s.tracks) {
    Json notes = Json::array();
    for (const auto& n : t.notes) notes.push_back({n.step, n.pitch, n.length, n.velocity});
    tracks.push_back(Json{{"instrument", t.instrument}, {"notes", notes}});
  }
  return Json{{"id", s.id},       {"owner", s.owner},         {"title", s.title},       {"bpm", s.bpm},
              {"tracks", tracks}, {"created_at", s.createdAt}, {"updated_at", s.updatedAt}, {"released", s.released},
              {"plays", s.plays}};
}

Song songFromJson(const Json& j) {
  Song s;
  s.id = j.at("id").get<std::string>();
  s.owner = j.at("owner").get<std::string>();
  s.title = j.at("title").get<std::string>();
  s.bpm = j.at("bpm").get<int>();
  for (const auto& t : j.at("tracks")) {
    SongTrack track;
    track.instrument = t.at("instrument").get<std::string>();
    for (const auto& n : t.at("notes"))
      track.notes.push_back(Note{n.at(0).get<int>(), n.at(1).get<int>(), n.at(2).get<int>(), n.at(3).get<int>()});
    s.tracks.push_back(std::move(track));
  }
  s.createdAt = j.at("created_at").get<GameMinutes>();
  s.updatedAt = j.at("updated_at").get<GameMinutes>();
  s.released = j.at("released").get<bool>();
  s.plays = j.at("plays").get<int>();
  return s;
}

Json toJson(const CharacterDef& c) {
  Json relationships = Json::array();
  for (const auto& r : c.relationships)
    relationships.push_back(Json{{"to", r.to}, {"dimensions", r.dimensions}, {"history", r.history}});
  Json out{{"id", c.id},
           {"first_name", c.firstName},
           {"last_name", c.lastName},
           {"pronouns", c.pronouns},
           {"gender", c.gender},
           {"age", c.age},
           {"playable", c.playable},
           {"personality", c.personality},
           {"values", c.values},
           {"traits", c.traits},
           {"interests", c.interests},
           {"skills", c.skills},
           {"career", {{"id", c.careerId}, {"level", c.careerLevel}}},
           {"finances", {{"cash_cents", c.startingCashCents}, {"bank_cents", c.startingBankCents}}},
           {"home", {{"property", c.homeProperty}}},
           {"spawn_location", c.spawnLocation},
           {"degrees", c.degrees},
           {"sex", c.sex},
           {"fame", c.fame},
           {"relationships", relationships},
           {"profile", c.profile}};
  if (!c.aspirations.empty()) out["aspirations"] = c.aspirations;  // only founders name them; saves stay as they were
  return out;
}

const char* toString(ConstructionStatus s) {
  switch (s) {
    case ConstructionStatus::Planned: return "planned";
    case ConstructionStatus::Active: return "active";
    case ConstructionStatus::Complete: return "complete";
  }
  return "planned";
}

ConstructionStatus constructionStatusFromString(const std::string& s) {
  if (s == "planned") return ConstructionStatus::Planned;
  if (s == "active") return ConstructionStatus::Active;
  if (s == "complete") return ConstructionStatus::Complete;
  throw std::invalid_argument("unknown construction status " + s);
}

Json worldStateToJson(const WorldState& s) {
  Json characters = Json::array();
  for (const auto& [id, c] : s.characters) characters.push_back(toJson(c));
  Json relationships = Json::array();
  for (const auto& [key, r] : s.relationships) {
    Json row = toJson(r);
    row["from"] = key.first;
    row["to"] = key.second;
    relationships.push_back(std::move(row));
  }
  Json memories = Json::array();
  for (const auto& m : s.memories) memories.push_back(toJson(m));
  Json accounts = Json::array();
  for (const auto& [id, a] : s.ledger.accounts())
    accounts.push_back(Json{{"id", a.id}, {"owner_id", a.ownerId}, {"kind", a.kind}, {"balance_cents", a.balanceCents},
                            {"allow_negative", a.allowNegative}});
  Json transactions = Json::array();
  for (const auto& t : s.ledger.transactions())
    transactions.push_back(Json{{"id", t.id}, {"at", t.at}, {"from", t.from}, {"to", t.to},
                                {"amount_cents", t.amountCents}, {"kind", t.kind}, {"memo", t.memo}});
  Json messages = Json::array();
  for (const auto& m : s.messages)
    messages.push_back(Json{{"id", m.id}, {"from", m.from}, {"to", m.to}, {"at", m.at}, {"body", m.body}, {"read", m.read}});
  Json notifications = Json::array();
  for (const auto& n : s.notifications)
    notifications.push_back(Json{{"id", n.id}, {"recipient", n.recipient}, {"at", n.at}, {"kind", n.kind},
                                 {"text", n.text}, {"read", n.read}});
  // Residents and owners of a property are in the homes part, as in the SQLite save.
  Json properties = Json::array();
  for (const auto& [id, p] : s.properties)
    properties.push_back(Json{{"id", p.id}, {"owner_account", p.ownerAccount}, {"tenant_id", p.tenant},
                              {"upkeep", {{"cleanliness", p.cleanliness}, {"trash", p.trash}}}});
  Json construction = Json::array();
  for (const auto& [id, c] : s.construction)
    construction.push_back(Json{{"id", c.id}, {"status", toString(c.status)}, {"worker_hours_done", c.workerHoursDone},
                                {"completed_at", c.completedAt}});
  Json created = Json::array();
  for (const auto& [id, def] : s.createdCharacters) created.push_back(toJson(def));
  Json songs = Json::array();
  for (const auto& [id, song] : s.songs) songs.push_back(toJson(song));
  Json parts = Json::object();
  for (const auto& [key, body] : worldPartsToJson(s)) parts[key] = body;
  return Json{{"format", kWorldJsonFormat},
              {"now", s.now},
              {"clock_carry", s.clockCarry},
              {"next_id", s.nextId},
              {"next_tx", s.ledger.nextTxNumber()},
              {"city_stage", s.city.stage},
              // As text: the save passes through JavaScript, whose numbers hold 53 bits, not 64.
              {"rng", std::to_string(s.rng)},
              {"characters", characters},
              {"relationships", relationships},
              {"memories", memories},
              {"ledger", {{"accounts", accounts}, {"transactions", transactions}}},
              {"messages", messages},
              {"notifications", notifications},
              {"properties", properties},
              {"construction", construction},
              {"city_stats", s.city.stats},
              {"created_characters", created},
              {"songs", songs},
              {"world_parts", parts}};
}

Result<WorldState> worldStateFromJson(const Json& j) {
  if (!j.is_object() || !j.contains("format")) return fail("save_corrupt", "not a saved world");
  if (!j["format"].is_number_integer() || j["format"].get<int>() != kWorldJsonFormat)
    return fail("save_version", "this save was written by a different version of the game");
  WorldState s;
  try {
    s.now = j.at("now").get<GameMinutes>();
    s.clockCarry = j.at("clock_carry").get<double>();
    s.nextId = j.at("next_id").get<std::uint64_t>();
    s.city.stage = j.at("city_stage").get<int>();
    if (const auto rng = j.find("rng"); rng != j.end())
      s.rng = rng->is_string() ? std::stoull(rng->get<std::string>()) : rng->get<std::uint64_t>();
    const auto nextTx = j.at("next_tx").get<std::uint64_t>();
    for (const auto& c : j.at("characters")) {
      CharacterState state = characterStateFromJson(c);
      s.characters[state.id] = std::move(state);
    }
    for (const auto& r : j.at("relationships"))
      s.relationships[{r.at("from").get<std::string>(), r.at("to").get<std::string>()}] = relationshipStateFromJson(r);
    for (const auto& m : j.at("memories")) s.memories.push_back(memoryFromJson(m));
    std::map<LedgerAccountId, LedgerAccount> accounts;
    std::vector<LedgerTransaction> txs;
    for (const auto& a : j.at("ledger").at("accounts")) {
      LedgerAccount account{a.at("id").get<std::string>(), a.at("owner_id").get<std::string>(),
                            a.at("kind").get<std::string>(), a.at("balance_cents").get<Cents>(),
                            a.at("allow_negative").get<bool>()};
      accounts[account.id] = std::move(account);
    }
    for (const auto& t : j.at("ledger").at("transactions"))
      txs.push_back(LedgerTransaction{t.at("id").get<std::string>(), t.at("at").get<GameMinutes>(),
                                      t.at("from").get<std::string>(), t.at("to").get<std::string>(),
                                      t.at("amount_cents").get<Cents>(), t.at("kind").get<std::string>(),
                                      t.at("memo").get<std::string>()});
    s.ledger.restore(std::move(accounts), std::move(txs), nextTx);
    if (s.ledger.sumOfBalances() != 0) return fail("ledger_unbalanced", "saved ledger does not balance");
    for (const auto& m : j.value("messages", Json::array()))
      s.messages.push_back(Message{m.at("id").get<std::string>(), m.at("from").get<std::string>(),
                                   m.at("to").get<std::string>(), m.at("at").get<GameMinutes>(),
                                   m.at("body").get<std::string>(), m.value("read", false)});
    for (const auto& n : j.value("notifications", Json::array()))
      s.notifications.push_back(Notification{n.at("id").get<std::string>(), n.at("recipient").get<std::string>(),
                                             n.at("at").get<GameMinutes>(), n.at("kind").get<std::string>(),
                                             n.at("text").get<std::string>(), n.value("read", false)});
    for (const auto& p : j.at("properties")) {
      PropertyState property{p.at("id").get<std::string>(), p.at("owner_account").get<std::string>(),
                             p.at("tenant_id").get<std::string>()};
      const Json upkeep = p.value("upkeep", Json::object());
      property.cleanliness = upkeep.value("cleanliness", property.cleanliness);
      property.trash = upkeep.value("trash", property.trash);
      s.properties[property.id] = std::move(property);
    }
    for (const auto& c : j.at("construction"))
      s.construction[c.at("id").get<std::string>()] =
          ConstructionState{c.at("id").get<std::string>(), constructionStatusFromString(c.at("status").get<std::string>()),
                            c.at("worker_hours_done").get<double>(), c.at("completed_at").get<GameMinutes>()};
    s.city.stats = j.value("city_stats", StatMap{});
    for (const auto& c : j.value("created_characters", Json::array())) {
      auto def = ContentDatabase::parseCharacter(c);
      if (!def) return fail("save_corrupt", "created character " + c.value("id", "?") + ": " + def.error().message);
      s.createdCharacters[def.value().id] = std::move(def).value();
    }
    for (const auto& song : j.value("songs", Json::array())) {
      Song parsed = songFromJson(song);
      s.songs[parsed.id] = std::move(parsed);
    }
    std::map<std::string, Json> parts;
    const Json partsJson = j.value("world_parts", Json::object());
    for (const auto& [key, body] : partsJson.items()) parts[key] = body;
    worldPartsFromJson(s, parts);
  } catch (const std::exception& e) {
    return fail("save_corrupt", std::string("saved world could not be read: ") + e.what());
  }
  return s;
}

}  // namespace livera
