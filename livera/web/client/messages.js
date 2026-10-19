// Plain-language words for what the server says: refusals become a sentence with a next step
// ("Heritage Coffee is closed. It opens at 06:00." [Walk there anyway]), and opening hours read as
// "Open until 20:00" / "Opens tomorrow at 06:00". Only the server's own data is used: its error
// codes and messages, and the opening hours `map` publishes (when it does). An unknown refusal is
// shown as the server worded it, with a capital letter.

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const hh = h => `${String(((h % 24) + 24) % 24).padStart(2, "0")}:00`;
export const sentence = s => {
  const t = String(s ?? "").trim();
  if (!t) return "";
  const c = t[0].toUpperCase() + t.slice(1);
  return /[.!?…]$/.test(c) ? c : c + ".";
};

// ------------------------------------------------------------------ opening hours
// `hours` is [open, close) in whole hours (a close before the open runs past midnight; equal means
// always open); `open_days` the weekdays it opens (0 = Monday; empty = every day). The server's own
// rule (Content.h OpeningHours::isOpenOn): a weekday not listed is closed all day.
const validHours = p => p && Array.isArray(p.hours) && p.hours.length === 2 && p.hours.every(Number.isFinite);
function openAt(p, weekday, hour) {
  const days = Array.isArray(p.open_days) ? p.open_days : [];
  if (days.length && !days.includes(weekday)) return false;
  const [o, c] = p.hours;
  if (o === c) return true;
  return o < c ? hour >= o && hour < c : hour >= o || hour < c;
}
// {open, text}: "Open until 20:00", "Closed · opens at 06:00", "Closed · opens tomorrow at 06:00",
// "Closed · opens Mon at 10:00". Null when the map doesn't say (older servers) or the place has no hours.
export function openingText(p, minute) {
  if (!validHours(p) || minute === null || minute === undefined) return null;
  const day0 = Math.floor(minute / 1440), hour0 = Math.floor((minute % 1440) / 60);
  const at = k => { const h = hour0 + k; return { day: day0 + Math.floor(h / 24), hour: h % 24 }; };
  const isOpen = k => { const t = at(k); return openAt(p, t.day % 7, t.hour); };
  if (isOpen(0)) {
    for (let k = 1; k <= 24 * 7; k++) if (!isOpen(k)) return { open: true, text: `Open until ${hh(at(k).hour)}` };
    return { open: true, text: "Open all day" };
  }
  for (let k = 1; k <= 24 * 8; k++) {
    if (!isOpen(k)) continue;
    const t = at(k), dd = t.day - day0;
    return { open: false, opens: `${dd === 0 ? "at" : dd === 1 ? "tomorrow at" : `${DAYS[t.day % 7]} at`} ${hh(t.hour)}`, text: `Closed · opens ${dd === 0 ? "at" : dd === 1 ? "tomorrow at" : `${DAYS[t.day % 7]} at`} ${hh(t.hour)}` };
  }
  return { open: false, text: "Closed" };
}

// ------------------------------------------------------------------ refusals
// explain(reply, ctx) -> {text, action?: {label, run}}. ctx (all optional): what (the thing tried,
// "Drip coffee"), place (a map place, for its hours), person (a name), minute (the game clock),
// cooldown (minutes until it can be done again), and the next steps the caller can offer:
// walk (walk there), exit, stop, goWork ({name, run}).
export function explain(r, ctx = {}) {
  const e = (r && r.error) || {}, code = e.code || "", msg = sentence(e.message || "Something went wrong");
  const act = (label, run) => (run ? { label, run } : undefined);
  switch (code) {
    case "closed": {
      const o = ctx.place ? openingText(ctx.place, ctx.minute) : null;
      const name = ctx.place && ctx.place.name;
      return { text: `${name ? `${name} is closed` : msg.replace(/\.$/, "")}.${o && o.opens ? ` It opens ${o.opens}.` : ""}` };
    }
    case "too_far":
      if (ctx.person) return { text: `Walk up to ${ctx.person} first.`, action: act("Walk over", ctx.walk) };
      if (ctx.place) return { text: `You're not at the door of ${ctx.place.name} yet.`, action: act("Walk there", ctx.walk) };
      return { text: msg, action: act("Walk there", ctx.walk) };
    case "too_soon":
      return { text: `You just did that.${ctx.cooldown > 0 ? ` Again in about ${Math.max(1, Math.round(ctx.cooldown))} min.` : " Give it a little while."}` };
    case "phone_dead": return { text: "Your phone is flat: charge it at home or at work." };
    case "no_phone": return { text: "You don't have a phone." };
    case "not_at_stop": return { text: "Walk to the stop first.", action: act("Walk there", ctx.walk) };
    case "busy": return { text: "You're already on your way somewhere.", action: act("Stop", ctx.stop) };
    case "riding": return { text: "You're on the bus: you get off at your stop." };
    case "inside_building": return { text: `You're inside${ctx.here ? ` ${ctx.here}` : ""}. Exit first.`, action: act("Exit", ctx.exit) };
    case "not_inside": return { text: "You're already outside." };
    case "insufficient_funds": case "cant_afford":
      return { text: `You can't afford ${ctx.what || "that"} right now${ctx.method === "cash" ? " in cash" : ctx.method ? " from your bank" : ""}.` };
    case "wrong_place":
      if (ctx.goWork) return { text: `Go to your workplace first: ${ctx.goWork.name}.`, action: act("Go", ctx.goWork.run) };
      return { text: msg };
    case "no_career": return { text: "You don't have a job yet: the Jobs app lists openings." };
    case "not_working": return { text: "You're not on shift." };
    case "already_working": return { text: "You're already on shift." };
    case "no_service": return { text: `The bus isn't running now: ${msg}` };
    case "target_unavailable": return { text: `${ctx.person ? ctx.person + " isn't" : "They're not"} here any more.` };
    case "invalid_payment": return { text: "Pay by card, cash or LivPay." };
    case "unknown_request": return { text: "That ask has passed." };
    default:
      return { text: ctx.what && !msg.toLowerCase().includes(String(ctx.what).toLowerCase()) ? `${ctx.what}: ${msg}` : msg };
  }
}
