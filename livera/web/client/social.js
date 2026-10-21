// The Social app (D-074): how word gets around Livéra. Everything here is the server's answer: `phone {app:
// "social"}` (your feed, your activity, things you could share, people you know), `social_feed {tab}` (the town),
// `social_profile {account}`, and the ops `post`, `comment`, `like` / `unlike`, `follow` / `unfollow`, each with its
// refusal shown where you pressed. A post's picture is the place's own picture (its room, else its building), never
// a photo of anyone. Posts the game wrote say so: for someone a script plays, and for the anonymous gossip account.
// Whether a gossip post is true is shown only to someone who was there, because only the server knows who was.
//
//   socialScreen.call(phone, data)   (phone.js: the Social app)
//
// Server text reaches the page only through el() (text nodes).

import { el, replace, avatar, firstName, spriteUrl } from "./dom.js";
import { icon } from "./icons.js";
import { sentence, minuteWhen } from "./verbs.js";
import { loadRoomManifest, roomUrl } from "./interior.js";

(function addStylesheet() {
  if (typeof document === "undefined" || document.querySelector("link[data-social-css]")) return;
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = new URL("./css/social.css", import.meta.url).href;
  link.dataset.socialCss = "";
  document.head.appendChild(link);
})();

const TABS = [["feed", "Feed"], ["town", "Town"], ["activity", "Activity"], ["you", "You"]];
const plural = (n, one, many = one + "s") => `${n} ${n === 1 ? one : many}`;
const count = n => (n >= 10000 ? `${Math.round(n / 1000)}k` : n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n));

// "just now", "12 min", "3 h", else the game date: post times in the game's own clock.
function ago(phone, at) {
  const now = phone.world.minute();
  if (typeof at !== "number" || now === null) return "";
  const m = Math.max(0, Math.floor(now - at));
  if (m < 1) return "just now";
  if (m < 60) return `${m} min ago`;
  if (m < 24 * 60) return `${Math.floor(m / 60)} h ago`;
  return minuteWhen(at);
}

// The gossip account has no face: a gold mask.
function face(author, size = "mid") {
  if (author && author.gossip) return el("span", { class: `av ${size} gossip-face`, "aria-hidden": "true" }, icon("mask"));
  return avatar(author && author.account, author && author.name, size);
}

// The place's own picture: its room if the owner painted one, else its building on the map.
function placePicture(phone, place) {
  if (!place || !place.id) return null;
  const w = phone.world, b = w.buildingOfPlace && w.buildingOfPlace.get(place.id);
  const url = roomUrl(place.id) || spriteUrl(place.id) || (b && spriteUrl(b.id));
  if (!url) return null;
  return el("figure", { class: "post-pic" },
    el("img", { src: url, alt: `${place.name}, the place`, loading: "lazy", draggable: "false" }),
    el("figcaption", null, icon("pin"), place.name));
}

function scriptBadge(author) {
  if (!author) return null;
  if (author.gossip) return el("span", { class: "badge script" }, "Anonymous");
  if (author.scripted) return el("span", { class: "badge script" }, "Played by a script");
  return null;
}

// What a post's footer says about who wrote it, when the game did.
function writtenBy(p) {
  if (!p.automatic) return null;
  if (p.author && p.author.gossip) return el("p", { class: "post-note" }, "Posted by the gossip account from what people saw. Who runs it is a secret.");
  return el("p", { class: "post-note" }, `Written by the game from what really happened to ${firstName(p.author && p.author.name)}, played by a script.`);
}

function gossipLine(p) {
  const g = p.gossip;
  if (!g) return null;
  const heard = el("span", { class: "heard" }, icon("people"), `Heard by ${count(g.heard_by || 0)}`);
  let truth;
  if (g.you_were_there) {
    truth = g.true ? el("span", { class: "truth yes" }, "You were there: that's what happened.")
      : el("span", { class: "truth no" }, "You were there: that's not how it happened.");
  } else {
    truth = el("span", { class: "truth unknown" }, g.you_heard ? "You heard about it too. Is it true? Only the people who were there know."
      : "Is it true? Only the people who were there know.");
  }
  return el("div", { class: "gossip-line" }, heard, truth);
}

// One post, with Like, Comment and the latest comments.
export function postCard(phone, p, { onChange } = {}) {
  const s = phone.social;
  const err = el("p", { class: "err", role: "alert" });
  const node = el("article", { class: `post${p.author && p.author.gossip ? " gossip" : ""}${p.mine ? " mine" : ""}`, dataset: { post: p.post, author: p.author ? p.author.account : "" } });
  const redraw = fresh => { const n = postCard(phone, fresh, { onChange }); node.replaceWith(n); if (onChange) onChange(fresh); return n; };
  const who = el("button", { type: "button", class: "post-who", "aria-label": `${p.author ? p.author.name : ""}'s profile`, onclick: () => phone.socialProfile(p.author.account) },
    face(p.author),
    el("span", { class: "post-names" }, el("strong", null, p.author ? p.author.name : ""),
      el("span", { class: "handle" }, `@${p.author ? p.author.handle : ""} · ${ago(phone, p.at)}`)));
  const like = el("button", { type: "button", class: `act like${p.liked ? " on" : ""}`, "aria-pressed": String(!!p.liked), disabled: p.mine,
    "aria-label": p.mine ? `${plural(p.likes || 0, "like")} on your post` : p.liked ? "Unlike" : "Like", dataset: { like: p.post },
    onclick: async () => {
      err.textContent = "";
      const r = await phone.game.req(p.liked ? "unlike" : "like", { post: p.post });
      if (!r.ok) { err.textContent = sentence(r.error.message); return; }
      redraw({ ...p, liked: r.data.liked, likes: r.data.likes });
    } }, icon("heart"), el("span", null, count(p.likes || 0)));
  const form = el("form", { class: "comment-form", hidden: true, onsubmit: async e => {
    e.preventDefault();
    const text = input.value.trim();
    if (!text) { err.textContent = "Write something first."; return; }
    const r = await phone.game.req("comment", { post: p.post, text });
    if (!r.ok) { err.textContent = sentence(r.error.message); return; }
    const n = redraw(r.data.post);
    const again = n.querySelector(".comment-form"); if (again) again.hidden = true;
  } });
  const input = el("input", { type: "text", class: "input", maxlength: String((s && s.limits && s.limits.comment_max_length) || 200), placeholder: "Add a comment", "aria-label": "Comment", autocomplete: "off" });
  form.append(el("div", { class: "grow" }, input), el("button", { type: "submit", class: "btn small primary", "aria-label": "Send comment" }, icon("send")));
  const comment = el("button", { type: "button", class: "act", "aria-label": "Comment", dataset: { comment: p.post }, onclick: () => { form.hidden = !form.hidden; if (!form.hidden) input.focus(); } },
    icon("comment"), el("span", null, count(p.comments || 0)));
  const tags = (p.tags || []).length ? el("p", { class: "post-tags" }, "with ", (p.tags || []).map((t, i) => [i ? (i === p.tags.length - 1 ? " and " : ", ") : "",
    el("button", { type: "button", class: "tag-link", onclick: () => phone.socialProfile(t.account) }, t.name)])) : null;
  const picture = placePicture(phone, p.place);
  replace(node,  // (the DOM's own append would print a null as "null"; replace skips it, as el() does)
    el("header", { class: "post-head" }, who, scriptBadge(p.author)),
    p.topic_label ? el("span", { class: `topic topic-${p.topic}` }, p.topic_label) : null,
    el("p", { class: "post-text" }, p.text),
    tags,
    picture || (p.place ? el("p", { class: "post-place" }, icon("pin"), p.place.name) : null),
    gossipLine(p),
    writtenBy(p),
    el("div", { class: "post-acts" }, like, comment),
    (p.recent_comments || []).length ? el("ul", { class: "comments" }, p.recent_comments.map(c => el("li", null,
      el("strong", null, firstName(c.name)), " ", c.text, el("span", { class: "hint" }, ` · ${ago(phone, c.at)}`)))) : null,
    p.comments > (p.recent_comments || []).length ? el("p", { class: "hint" }, `${plural(p.comments, "comment")} in all.`) : null,
    form, err);
  return node;
}

// The composer: what you're doing, where you are (if you say), and who's with you (people you know).
function composer(phone, d) {
  const w = phone.world, s = phone.social;
  const max = (d.limits && d.limits.post_max_length) || 280, maxTags = (d.limits && d.limits.max_tags) || 4;
  const here = w.self && w.self.inside ? w.placeById.get(w.self.inside) : (w.here && w.here.id ? w.here : null);
  const text = el("textarea", { class: "input compose-text", rows: "3", maxlength: String(max), placeholder: "What's happening?", "aria-label": "Post" });
  text.value = s.draft || "";
  const counter = el("span", { class: "hint counter" }, `${(s.draft || "").length}/${max}`);
  text.addEventListener("input", () => { s.draft = text.value; counter.textContent = `${[...text.value].length}/${max}`; });
  const err = el("p", { class: "err", role: "alert" });
  const placeBtn = here ? el("button", { type: "button", class: "chip", "aria-pressed": String(s.withPlace !== false), dataset: { compose: "place" },
    onclick: () => { s.withPlace = s.withPlace === false; placeBtn.setAttribute("aria-pressed", String(s.withPlace !== false)); } }, icon("pin"), here.name) : null;
  // People you know, those here first: the server refuses a tag of anyone else.
  const known = new Map((phone.people || []).map(p => [p.id, p]));
  const present = [...w.people.values()].filter(p => known.has(p.id)).map(p => p.id);
  const tagIds = [...new Set([...present, ...known.keys()])].slice(0, 12);
  const tagBox = el("div", { class: "tag-picker", role: "group", "aria-label": "Tag people you know", hidden: !tagIds.length });
  const drawTags = () => replace(tagBox, tagIds.map(id => el("button", { type: "button", class: "target", "aria-pressed": String(s.tags.has(id)), dataset: { tag: id },
    onclick: () => { if (s.tags.has(id)) s.tags.delete(id); else if (s.tags.size < maxTags) s.tags.add(id); drawTags(); } },
    avatar(id, (known.get(id) || {}).name || w.nameOf(id)), firstName((known.get(id) || {}).name || w.nameOf(id)))));
  drawTags();
  const runs = d.gossip_account && d.gossip_account.you_run_it;
  const asBox = runs ? el("label", { class: "as-gossip" }, el("input", { type: "checkbox", checked: !!s.asGossip, onchange: e => { s.asGossip = e.target.checked; } }),
    ` Post as @${d.gossip_account.handle} (your secret: nobody else is told)`) : null;
  const send = async e => {
    e.preventDefault();
    err.textContent = "";
    const body = text.value.trim();
    if (!body) { err.textContent = "Write something first."; return; }
    const args = { text: body };
    if (here && s.withPlace !== false) args.place = here.id;
    if (s.tags.size) args.tags = [...s.tags];
    if (s.about) args.about = s.about;
    if (runs && s.asGossip) args.as = d.gossip_account.account;
    const r = await phone.game.req("post", args);
    if (!r.ok) { err.textContent = sentence(r.error.message); return; }
    s.draft = ""; s.tags.clear(); s.about = null; s.asGossip = false;
    phone.ui.toast(`Posted${r.data.post && r.data.post.place ? ` from ${r.data.post.place.name}` : ""}.`, false, { log: false });
    phone.reload();
  };
  return el("form", { class: "card composer", onsubmit: send },
    el("div", { class: "row compose-top" }, avatar(w.selfId, w.selfName, "mid"), el("div", { class: "grow" }, text)),
    el("div", { class: "row compose-opts" }, placeBtn, counter),
    tagIds.length ? el("p", { class: "hint" }, `Tag people you know (up to ${maxTags}):`) : null, tagBox,
    asBox, err,
    el("button", { type: "submit", class: "btn primary block", dataset: { compose: "send" } }, "Post"),
    el("p", { class: "hint" }, "Everyone in town can read your posts. Your messages stay private."));
}

// Things that happened to you, offered with a line in your voice: Post shares it (about that moment).
function shareCards(phone, d) {
  const s = phone.social;
  return (d.share || []).map(m => el("div", { class: "card share", dataset: { share: m.about } },
    el("div", { class: "eyebrow" }, `Share it? · ${m.topic_label || "Something that happened"}`),
    el("p", { class: "post-text" }, m.text),
    m.place ? el("p", { class: "hint" }, icon("pin"), ` ${m.place.name}${m.here ? " (you're here)" : ""}`) : null,
    el("div", { class: "row" },
      el("button", { type: "button", class: "btn small primary", onclick: async () => {
        const args = { text: m.text, about: m.about };
        if (m.place && m.here) args.place = m.place.id;
        if ((m.tags || []).length) args.tags = m.tags.map(t => t.account);
        const r = await phone.game.req("post", args);
        if (!r.ok) { phone.ui.toast(sentence(r.error.message), true); return; }
        phone.reload();
      } }, "Post this"),
      el("button", { type: "button", class: "btn small", onclick: () => { s.draft = m.text; s.about = m.about; s.tab = "feed"; phone.reload(); } }, "Edit first"))));
}

function accountCard(phone, a, { big = false } = {}) {
  const err = el("p", { class: "err", role: "alert" });
  const follow = a.you ? null : el("button", { type: "button", class: `btn small${a.you_follow ? "" : " primary"}`, dataset: { follow: a.account },
    onclick: async () => {
      const r = await phone.game.req(a.you_follow ? "unfollow" : "follow", { account: a.account });
      if (!r.ok) { err.textContent = sentence(r.error.message); return; }
      phone.reload();
    } }, a.you_follow ? "Following" : "Follow");
  return el("div", { class: `card account${big ? " big" : ""}`, dataset: { account: a.account } },
    el("div", { class: "row" }, face(a, big ? "big" : "mid"),
      el("div", { class: "grow stack-tight" }, el("h3", null, a.name), el("span", { class: "handle" }, `@${a.handle}`),
        el("span", { class: "row badges" }, a.gossip ? el("span", { class: "badge script" }, "Anonymous") : a.scripted ? el("span", { class: "badge script" }, "Played by a script") : null,
          a.fame_tier ? el("span", { class: "badge" }, a.fame_tier) : null, a.follows_you ? el("span", { class: "badge open" }, "Follows you") : null)),
      big ? null : follow),
    a.bio ? el("p", { class: "bio" }, a.bio) : null,
    el("p", { class: "stats" }, el("span", null, el("strong", null, count(a.posts || 0)), " posts"), el("span", null, el("strong", null, count(a.followers || 0)), " followers"),
      a.gossip ? null : el("span", null, el("strong", null, count(a.following || 0)), " following")),
    a.you_run_it ? el("p", { class: "notice" }, "You run this account. It's your secret: nobody else's phone ever says so.") : null,
    big && follow ? el("div", { class: "row" }, follow, !a.gossip && a.known ? el("button", { type: "button", class: "btn small", onclick: () => phone.openApp("messages", { to: a.account }) }, "Message") : null) : null,
    err);
}

function activityList(phone, d) {
  const items = d.activity || [];
  if (!items.length) return [el("p", { class: "hint" }, "Nothing yet. When people like, comment on or share something about you, it shows here.")];
  const what = a => {
    const n = firstName(a.from.name), more = a.count > 1 ? ` and ${plural(a.count - 1, "other")}` : "";
    if (a.kind === "like") return `${n}${more} liked your post.`;
    if (a.kind === "comment") return `${n} commented on your post.`;
    if (a.kind === "follow") return `${n} followed you.`;
    if (a.kind === "tag") return `${n} tagged you in a post.`;
    if (a.kind === "gossip") return `@${a.from.handle} posted about you.`;
    return `${n}.`;
  };
  return [el("ul", { class: "activity" }, items.map(a => el("li", { class: a.new ? "new" : "" },
    face({ account: a.from.account, name: a.from.name, gossip: a.from.gossip }, ""),
    el("span", { class: "grow" }, what(a), el("span", { class: "hint" }, ` · ${ago(phone, a.at)}`)))))];
}

// The app: tabs over the feed, the town, your activity and you.
export async function socialScreen(d) {
  const phone = this;
  if (d.enabled === false) return [el("p", { class: "hint" }, "There's no social media in this town.")];
  if (!phone.social) phone.social = { tab: "feed", draft: "", tags: new Set(), withPlace: true, about: null, asGossip: false, profile: null };
  const s = phone.social;
  s.limits = d.limits || {};
  phone.socialNew = 0; phone.game.setPhoneBadge();
  await Promise.all([loadRoomManifest(), phone.people && phone.people.length ? null : phone.loadPeople()]);
  if (s.profile) return profileScreen(phone, s.profile);
  const tabs = el("div", { class: "seg social-tabs", role: "tablist", "aria-label": "Social" },
    TABS.map(([id, label]) => el("button", { type: "button", role: "tab", "aria-selected": String(s.tab === id), "aria-pressed": String(s.tab === id), dataset: { tab: id },
      onclick: () => { s.tab = id; phone.reload(); } }, label, id === "activity" && d.new_activity ? el("span", { class: "badge-count inline" }, String(d.new_activity)) : null)));
  const out = [tabs];
  const list = posts => posts.length ? posts.map(p => postCard(phone, p)) : [el("p", { class: "hint" }, "No posts yet.")];
  if (s.tab === "feed") {
    // The morning opens with last night (D-076): the night's most liked posts and the gossip account's.
    const night = d.last_night, shown = new Set();
    if (night && ((night.top || []).length || (night.gossip || []).length)) {
      const posts = [...(night.gossip || []), ...(night.top || [])];
      for (const p of posts) shown.add(p.post);
      out.push(el("section", { class: "last-night", "aria-label": "Last night in Livéra" },
        el("div", { class: "eyebrow" }, "Last night in Livéra"),
        el("p", { class: "hint" }, "What the town was talking about overnight: the most liked posts and @livera.unfiltered's."),
        posts.map(p => postCard(phone, p))));
    }
    out.push(composer(phone, d), ...shareCards(phone, d));
    out.push(...list((d.feed || []).filter(p => !shown.has(p.post))));
    if (!(d.feed || []).length) out.push(el("p", { class: "hint" }, "Your feed has the people you follow, you, posts you're in, and gossip that reached you. The Town tab has everyone."));
  } else if (s.tab === "town") {
    const r = await phone.game.req("social_feed", { tab: "town" });
    out.push(el("p", { class: "hint" }, "Every public post in Livéra, newest first."));
    out.push(...(r.ok ? list(r.data.posts || []) : [el("p", { class: "err", role: "alert" }, sentence(r.error.message))]));
  } else if (s.tab === "activity") {
    out.push(...activityList(phone, d));
  } else {
    out.push(accountCard(phone, d.you, { big: true }));
    if (d.gossip_account) out.push(el("div", { class: "eyebrow" }, "The town's gossip"), accountCard(phone, d.gossip_account));
    if ((d.suggested || []).length) out.push(el("div", { class: "eyebrow" }, "People you know"), ...d.suggested.map(a => accountCard(phone, a)));
    const r = await phone.game.req("social_profile", { account: d.you.account });
    out.push(el("div", { class: "eyebrow" }, "Your posts"), ...(r.ok ? list(r.data.posts || []) : []));
  }
  return out;
}

async function profileScreen(phone, account) {
  const s = phone.social;
  const r = await phone.game.req("social_profile", { account });
  const back = el("button", { type: "button", class: "btn small", onclick: () => { s.profile = null; phone.reload(); } }, icon("back"), "Back");
  if (!r.ok) return [back, el("p", { class: "err", role: "alert" }, sentence(r.error.message))];
  const posts = r.data.posts || [];
  return [back, accountCard(phone, r.data.account, { big: true }),
    ...(posts.length ? posts.map(p => postCard(phone, p)) : [el("p", { class: "hint" }, "No posts yet.")])];
}
