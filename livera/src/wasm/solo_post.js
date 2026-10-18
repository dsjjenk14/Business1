// Appended to livera_solo.js (CMake: --post-js). Wraps the exported C functions so a page calls
// `Module.solo_load(text)` and gets a JS string back. The wrappers copy string arguments to the wasm
// heap: Emscripten's `ccall`/`cwrap` put "string" arguments on the wasm stack (64 KB by default),
// which a save (tens of KB after one morning, more later) overflows and silently corrupts memory.
// Use these, not ccall, for anything that may be large.
(function () {
  function toHeap(text) {
    if (text === null || text === undefined) return 0;  // a null pointer: "no argument"
    const s = typeof text === "string" ? text : JSON.stringify(text);
    const n = lengthBytesUTF8(s) + 1;
    const p = _malloc(n);
    stringToUTF8(s, p, n);
    return p;
  }
  function withText(fn, text) {
    const p = toHeap(text);
    try { return UTF8ToString(fn(p)); } finally { if (p) _free(p); }
  }
  Module["solo_new"] = () => UTF8ToString(_solo_new());
  Module["solo_load"] = stateJson => withText(_solo_load, stateJson);
  Module["solo_save"] = () => UTF8ToString(_solo_save());
  Module["solo_rules"] = () => UTF8ToString(_solo_rules());
  Module["solo_characters"] = () => UTF8ToString(_solo_characters());
  Module["solo_create_character"] = sheetJson => withText(_solo_create_character, sheetJson);
  Module["solo_play"] = characterId => withText(_solo_play, characterId);
  Module["solo_leave"] = () => UTF8ToString(_solo_leave());
  Module["solo_request"] = reqJson => withText(_solo_request, reqJson);
  Module["solo_tick"] = realSeconds => UTF8ToString(_solo_tick(+realSeconds));
  Module["solo_autopilot_start"] = idsJson => withText(_solo_autopilot_start, idsJson);
  Module["solo_autopilot_stop"] = () => UTF8ToString(_solo_autopilot_stop());
  Module["solo_autopilot_status"] = () => UTF8ToString(_solo_autopilot_status());
})();
