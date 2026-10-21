cmake_minimum_required(VERSION 3.20)
project(Livera VERSION 0.1.0 LANGUAGES CXX)

# LIVÉRA authoritative simulation core, dedicated server, and headless dev client.
# The core library has no engine dependency so an Unreal Engine module can link it later
# (see docs/ARCHITECTURE.md, "Engine integration").

set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)
set(CMAKE_EXPORT_COMPILE_COMMANDS ON)

if(NOT CMAKE_BUILD_TYPE AND NOT CMAKE_CONFIGURATION_TYPES)
  set(CMAKE_BUILD_TYPE RelWithDebInfo CACHE STRING "" FORCE)
endif()

option(LIVERA_WARNINGS_AS_ERRORS "Treat compiler warnings as errors" ON)
option(LIVERA_SANITIZE "Build with address + undefined-behaviour sanitizers" OFF)
# The single-player build: the core and the shared op dispatch compiled to WebAssembly with Emscripten
# (`emcmake cmake -S . -B build-wasm -DLIVERA_WASM=ON`, or scripts/build_wasm.sh). It has no SQLite,
# OpenSSL, sockets, server, cli or tests: the browser save is JSON (core/Serialization.h).
option(LIVERA_WASM "Build the single-player WebAssembly module (needs the Emscripten toolchain)" OFF)
if(LIVERA_WASM AND NOT EMSCRIPTEN)
  message(FATAL_ERROR "LIVERA_WASM needs the Emscripten toolchain: emcmake cmake -S . -B build-wasm -DLIVERA_WASM=ON")
endif()
if(LIVERA_WASM)
  # -O2 and no DWARF: debug info would double the module that ships inside the page.
  set(CMAKE_CXX_FLAGS_RELEASE "-O2 -DNDEBUG")
  set(CMAKE_CXX_FLAGS_RELWITHDEBINFO "-O2 -DNDEBUG")
endif()

# --- Dependencies -------------------------------------------------------------
find_package(nlohmann_json 3.11 QUIET)
if(NOT nlohmann_json_FOUND)
  include(FetchContent)
  FetchContent_Declare(nlohmann_json
    URL https://github.com/nlohmann/json/releases/download/v3.11.3/json.tar.xz
    URL_HASH SHA256=d6c65aca6b1ed68e7a182f4757257b107ae403032760ed6ef121c9d55e81757d
    DOWNLOAD_EXTRACT_TIMESTAMP TRUE)
  FetchContent_MakeAvailable(nlohmann_json)
endif()
if(NOT LIVERA_WASM)
  find_package(SQLite3 REQUIRED)
  find_package(OpenSSL REQUIRED)
  find_package(Threads REQUIRED)
endif()

function(livera_target_options target)
  if(MSVC)
    target_compile_options(${target} PRIVATE /W4)
  else()
    target_compile_options(${target} PRIVATE -Wall -Wextra -Wpedantic -Wshadow -Wconversion -Wno-sign-conversion)
    if(LIVERA_WARNINGS_AS_ERRORS)
      target_compile_options(${target} PRIVATE -Werror)
    endif()
    if(LIVERA_SANITIZE)
      target_compile_options(${target} PRIVATE -fsanitize=address,undefined -fno-omit-frame-pointer)
      target_link_options(${target} PRIVATE -fsanitize=address,undefined)
    endif()
    if(LIVERA_WASM)
      # Emscripten disables exceptions by default; the core throws (and catches) on bad arguments.
      target_compile_options(${target} PRIVATE -fexceptions)
      target_link_options(${target} PRIVATE -fexceptions)
      # Emscripten's clang checks for unused constants, which GCC (the normal build) never does.
      target_compile_options(${target} PRIVATE -Wno-unused-const-variable)
    endif()
  endif()
endfunction()

# --- Core: pure simulation, no IO beyond reading content files ----------------
add_library(livera_core
  src/core/CharacterCreator.cpp
  src/core/Clock.cpp
  src/core/Content.cpp
  src/core/ContentMore.cpp
  src/core/Crime.cpp
  src/core/Education.cpp
  src/core/Fame.cpp
  src/core/Family.cpp
  src/core/Homes.cpp
  src/core/Interiors.cpp
  src/core/LifeEvents.cpp
  src/core/Fights.cpp
  src/core/WorkTasks.cpp
  src/core/Wallet.cpp
  src/core/Leisure.cpp
  src/core/Pets.cpp
  src/core/Details.cpp
  src/core/Goals.cpp
  src/core/Sleep.cpp
  src/core/Away.cpp
  src/core/WorldParts.cpp
  src/core/Items.cpp
  src/core/Ledger.cpp
  src/core/Life.cpp
  src/core/Music.cpp
  src/core/Romance.cpp
  src/core/Substances.cpp
  src/core/Serialization.cpp
  src/core/Autopilot.cpp
  src/core/TownLife.cpp
  src/core/World.cpp
  src/core/WorldViews.cpp)
target_include_directories(livera_core PUBLIC src)
target_link_libraries(livera_core PUBLIC nlohmann_json::nlohmann_json)
livera_target_options(livera_core)

# --- Protocol: the in-world op routing shared by the server and the single-player build ----
add_library(livera_protocol src/protocol/WorldOps.cpp src/protocol/LocalTown.cpp)
target_link_libraries(livera_protocol PUBLIC livera_core)
livera_target_options(livera_protocol)

# --- Browser WebAssembly module (LIVERA_WASM only): single-player and the "Play together" host ---------
if(LIVERA_WASM)
  add_executable(livera_solo src/wasm/solo.cpp)
  target_link_libraries(livera_solo PRIVATE livera_core livera_protocol)
  livera_target_options(livera_solo)
  set_target_properties(livera_solo PROPERTIES OUTPUT_NAME livera_solo SUFFIX .js)
  set(LIVERA_WASM_ENVIRONMENT "web,node" CACHE STRING "Emscripten -sENVIRONMENT (node is for web/tests/solo_smoke.mjs)")
  # One ES module with the wasm inlined (no MIME-type trouble on static hosts) and data/ embedded at /data.
  # The wasm is inlined as base64, not Emscripten's raw-byte string: the file stays plain ASCII text, which
  # hosts that refuse control characters in a .js file (the Claude artifact publisher) accept.
  target_link_options(livera_solo PRIVATE
    -sSINGLE_FILE=1 -sSINGLE_FILE_BINARY_ENCODE=0 -sMODULARIZE=1 -sEXPORT_ES6=1 -sEXPORT_NAME=createLivera -sALLOW_MEMORY_GROWTH=1
    "-sENVIRONMENT=${LIVERA_WASM_ENVIRONMENT}"
    "-sEXPORTED_FUNCTIONS=_solo_new,_solo_load,_solo_save,_solo_rules,_solo_characters,_solo_create_character,_solo_play,_solo_leave,_solo_request,_solo_tick,_solo_autopilot_start,_solo_autopilot_stop,_solo_autopilot_status,_town_join,_town_leave,_town_request,_town_tick,_town_characters,_town_create_character,_town_creator_options,_town_humans,_malloc,_free"
    "-sEXPORTED_RUNTIME_METHODS=ccall,cwrap,UTF8ToString,stringToUTF8,lengthBytesUTF8"
    # ccall puts string arguments on the wasm stack; the wrappers in solo_post.js use the heap instead,
    # and the stack is still larger than the default 64 KB for the core's own deep calls.
    -sSTACK_SIZE=2MB
    "SHELL:--post-js ${CMAKE_CURRENT_SOURCE_DIR}/src/wasm/solo_post.js"
    "SHELL:--embed-file ${CMAKE_CURRENT_SOURCE_DIR}/data@/data")
  # Every data file, not the directory: a directory's time changes only when files come or go, so an
  # edited file would otherwise leave the old data embedded.
  file(GLOB_RECURSE LIVERA_DATA_FILES CONFIGURE_DEPENDS ${CMAKE_CURRENT_SOURCE_DIR}/data/*)
  set_property(TARGET livera_solo APPEND PROPERTY LINK_DEPENDS
    ${LIVERA_DATA_FILES} ${CMAKE_CURRENT_SOURCE_DIR}/src/wasm/solo_post.js)
endif()

if(NOT LIVERA_WASM)
# --- Persistence + auth --------------------------------------------------------
add_library(livera_persistence
  src/persistence/SqliteStore.cpp
  src/persistence/PasswordHash.cpp)
target_link_libraries(livera_persistence PUBLIC livera_core SQLite::SQLite3 OpenSSL::Crypto)
livera_target_options(livera_persistence)

# --- Networking + dedicated server ------------------------------------------------
add_library(livera_server_lib
  src/net/Socket.cpp
  src/server/Auth.cpp
  src/server/RateLimiter.cpp
  src/server/Server.cpp)
target_link_libraries(livera_server_lib PUBLIC livera_core livera_protocol livera_persistence Threads::Threads)
livera_target_options(livera_server_lib)

add_executable(livera_server src/server/main.cpp)
target_link_libraries(livera_server PRIVATE livera_server_lib)
livera_target_options(livera_server)

add_executable(livera_cli src/client/cli_main.cpp)
target_link_libraries(livera_cli PRIVATE livera_core)
target_sources(livera_cli PRIVATE src/net/Socket.cpp src/client/CreatorWizard.cpp src/client/MusicText.cpp)
livera_target_options(livera_cli)

# --- Tests ------------------------------------------------------------------------
enable_testing()
add_executable(livera_tests
  tests/test_main.cpp
  tests/test_clock.cpp
  tests/test_content.cpp
  tests/test_ledger.cpp
  tests/test_world.cpp
  tests/test_persistence.cpp
  tests/test_server.cpp
  tests/test_creator.cpp
  tests/test_social_music.cpp
  tests/test_cast.cpp
  tests/test_life.cpp
  tests/test_items.cpp
  tests/test_school.cpp
  tests/test_crime.cpp
  tests/test_romance.cpp
  tests/test_family.cpp
  tests/test_homes.cpp
  tests/test_work.cpp
  tests/test_wallet.cpp
  tests/test_leisure.cpp
  tests/test_pets.cpp
  tests/test_details.cpp
  tests/test_autopilot.cpp
  tests/test_protocol.cpp
  tests/test_localtown.cpp
  tests/test_goals.cpp
  tests/test_interiors.cpp
  tests/test_events.cpp
  tests/test_street.cpp
  src/client/MusicText.cpp)
target_link_libraries(livera_tests PRIVATE livera_server_lib)
target_compile_definitions(livera_tests PRIVATE LIVERA_DATA_DIR="${CMAKE_CURRENT_SOURCE_DIR}/data")
livera_target_options(livera_tests)
add_test(NAME livera_tests COMMAND livera_tests)
endif()  # NOT LIVERA_WASM
