#include "protocol/WorldOps.h"

#include <cmath>
#include <cstdint>

namespace livera::protocol {

std::string str(const Json& req, const char* key) {
  auto it = req.find(key);
  return it != req.end() && it->is_string() ? it->get<std::string>() : std::string();
}

Result<Json> dispatchWorldOp(World& world, const CharacterId& me, const std::string& op, const Json& req) {
  // --- In-world ops: all validated by World -----------------------------------------
  if (op == "look") return world.look(me);
  if (op == "map") return world.mapView();
  if (op == "move") {
    Vec2 target;
    if (req.contains("location")) {
      const LocationDef* loc = world.content().location(str(req, "location"));
      if (!loc) return fail("unknown_location", "no such place");
      target = loc->door;
    } else {
      target = Vec2{req.at("x").get<double>(), req.at("y").get<double>()};
    }
    if (Status st = world.moveTo(me, target); !st) return st.error();
    const CharacterState* c = world.character(me);
    const double meters = distance(c->position, *c->moveTarget);
    return Json{{"target", {c->moveTarget->x, c->moveTarget->y}},
                {"eta_seconds", std::ceil(meters / world.content().sim().walkSpeedMetersPerSecond)}};
  }
  if (op == "enter") {
    if (Status st = world.enter(me, str(req, "location")); !st) return st.error();
    return world.look(me);
  }
  if (op == "exit") return world.exitBuilding(me);
  if (op == "interact") return world.interact(me, str(req, "interaction"), str(req, "target"));
  if (op == "buy") return world.buy(me, str(req, "offer"), req.value("method", std::string("card")));
  if (op == "activity") return world.useActivity(me, str(req, "activity"));
  if (op == "say") return world.say(me, str(req, "text"), req.value("volume", std::string("say")), str(req, "to"));
  if (op == "tip") return world.tip(me, str(req, "to"), req.at("cents").get<Cents>());
  // "id" is reserved for request/reply matching, so songs are named by "song" / "song_id".
  if (op == "song_save") {
    if (!req.contains("song") || !req["song"].is_object()) return fail("bad_request", "send the song as \"song\"");
    return world.saveSong(me, req["song"], str(req, "song_id"));
  }
  if (op == "song_release") return world.releaseSong(me, str(req, "song"));
  if (op == "song") return world.openSong(me, str(req, "song"));
  if (op == "perform") return world.perform(me, str(req, "song"));
  if (op == "work") {
    const std::string action = str(req, "action");
    if (action == "start") {
      if (Status st = world.startShift(me); !st) return st.error();
      return Json{{"on_shift", true}};
    }
    if (action == "end") return world.endShift(me);
    return fail("bad_request", "action must be start or end");
  }
  if (op == "phone") return world.openPhoneApp(me, str(req, "app"));
  if (op == "use") return world.useItem(me, str(req, "item"));
  if (op == "wear") return world.wear(me, str(req, "item"));
  if (op == "take_off") return world.takeOff(me, str(req, "slot"));
  if (op == "give") return world.giveItem(me, str(req, "to"), str(req, "item"));
  if (op == "ride")  // pay_with: card, cash or phone (LivPay)
    return world.ride(me, str(req, "to"), req.value("pay", true), req.value("pay_with", std::string("card")));
  if (op == "enroll") return world.enroll(me, str(req, "program"));
  if (op == "study") {
    const std::string action = str(req, "action");
    if (action == "start") {
      if (Status st = world.startStudy(me); !st) return st.error();
      return Json{{"studying", true}};
    }
    if (action == "end") return world.endStudy(me);
    return fail("bad_request", "action must be start or end");
  }
  if (op == "apply") return world.applyForJob(me, str(req, "career"));
  if (op == "steal") return world.steal(me, str(req, "offer"));
  if (op == "pickpocket") return world.pickpocket(me, str(req, "target"));
  if (op == "arrest") return world.arrest(me, str(req, "target"));
  if (op == "request")
    return world.request(me, str(req, "kind"), str(req, "target"), req.value("protection", false), str(req, "subject"));
  if (op == "respond") return world.respond(me, str(req, "request"), req.value("accept", false));
  if (op == "end_relationship") return world.endRelationship(me, str(req, "target"));
  if (op == "name_baby") return world.nameBaby(me, str(req, "child"), str(req, "name"));
  if (op == "care") return world.careFor(me, str(req, "child"), str(req, "action"));
  if (op == "enroll_child") return world.enrollChild(me, str(req, "child"), str(req, "where"));
  if (op == "hire_nanny") return world.hireNanny(me, str(req, "target"));
  if (op == "dismiss_nanny") return world.dismissNanny(me);
  // m08:homes ops { Buying homes, mortgages, moving in together (Homes.cpp)
  // Buying together, moving in together and selling a co-owned home are asks: request kind=buy_home|move_in|sell_home.
  if (op == "buy_home") return world.buyHome(me, str(req, "property"), req.value("down_payment_cents", Cents{0}));
  if (op == "move_out") return world.moveOut(me);
  if (op == "move_home") return world.moveHome(me, str(req, "property"));
  if (op == "sell_home") return world.sellHome(me, str(req, "property"));
  // } m08:homes

  // m08:work ops { Work decisions during shifts (WorkTasks.cpp)
  if (op == "work_tasks") return world.workTasks(me);
  if (op == "work_answer") {
    // `option` is the option's index in the order work_tasks sent; anything else is no option.
    const auto it = req.find("option");
    if (it == req.end() || !it->is_number_integer()) return fail("bad_request", "send the option's number as \"option\"");
    const auto n = it->get<std::int64_t>();
    return world.answerWorkTask(me, str(req, "task"), n < 0 || n > 64 ? -1 : static_cast<int>(n));
  }
  // } m08:work

  // m08:wallet ops { Coins, phones and LivPay (Wallet.cpp)
  // `buy_coins` verifies a store receipt, which only the server can do: it stays in Server::dispatch.
  if (op == "buy_with_coins") return world.buyWithCoins(me, str(req, "item"));
  if (op == "switch_phone") return world.switchPhone(me, str(req, "item"));
  if (op == "livpay_send") return world.livpaySend(me, str(req, "to"), req.at("cents").get<Cents>(), str(req, "note"));
  // } m08:wallet

  // m08:leisure ops { Sports, date spots and the lake park (Leisure.cpp)
  if (op == "join_team") return world.joinTeam(me, str(req, "team"));
  if (op == "leave_team") return world.leaveTeam(me, str(req, "team"));
  // } m08:leisure

  // m08:pets ops { Pets and medicine (Pets.cpp)
  if (op == "adopt") return world.adoptPet(me, str(req, "pet"), str(req, "name"), req.value("method", std::string("card")));
  if (op == "pet") return world.careForPet(me, str(req, "pet"), str(req, "action"));
  if (op == "vet") return world.vetVisit(me, str(req, "pet"), str(req, "service"), req.value("method", std::string("card")));
  // } m08:pets

  // m08:details ops { Accidents as a big deal, laundry, weather, birthdays, hangovers (Details.cpp)
  if (op == "laundry") return world.doLaundry(me);
  // } m08:details
  if (op == "message") {
    auto id = world.sendMessage(me, str(req, "to"), str(req, "text"));
    if (!id) return id.error();
    return Json{{"id", id.value()}};
  }
  return fail("unknown_op", "unknown op '" + op + "'");
}

}  // namespace livera::protocol
