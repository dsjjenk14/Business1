#pragma once

#include <optional>
#include <string>

#include "core/Types.h"

// Client-side music helpers for the dev client: a compact text notation for typing notes,
// and a Standard MIDI File writer so songs made in game can be heard in any music app.
// The server never sees this notation; it receives and validates plain note arrays.
namespace livera::client {

// Parses one track of notes. Each token is NOTE:STEPS[:LENGTH[:VELOCITY]].
//   NOTE   C4, F#3, Bb2, a MIDI number (60), or a drum name (kick, snare, hat, clap...)
//   STEPS  sixteenth-note positions, comma-separated: 0,4,8,12 (16 per bar)
//   LENGTH in sixteenths (default 1 for drums, 2 otherwise); VELOCITY 1-127 (default 100)
// Returns the server's note format ([[step, pitch, length, velocity], ...]) or an error.
Result<Json> parseNotes(const std::string& text, bool drums);

// Writes a song (server JSON with "bpm" and "tracks") as a type-1 MIDI file.
// `instruments` maps instrument id -> {"midi_program", "drums"}.
Status writeMidi(const Json& song, const Json& instruments, const std::string& path);

}  // namespace livera::client
