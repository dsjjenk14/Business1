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
find_package(SQLite3 REQUIRED)
find_package(OpenSSL REQUIRED)
find_package(Threads REQUIRED)

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
  endif()
endfunction()

# --- Core: pure simulation, no IO beyond reading content files ----------------
add_library(livera_core
  src/core/CharacterCreator.cpp
  src/core/Clock.cpp
  src/core/Content.cpp
  src/core/Ledger.cpp
  src/core/Life.cpp
  src/core/Music.cpp
  src/core/Serialization.cpp
  src/core/World.cpp
  src/core/WorldViews.cpp)
target_include_directories(livera_core PUBLIC src)
target_link_libraries(livera_core PUBLIC nlohmann_json::nlohmann_json)
livera_target_options(livera_core)

# --- Persistence + auth --------------------------------------------------------
add_library(livera_persistence
  src/persistence/SqliteStore.cpp
  src/persistence/PasswordHash.cpp)
target_link_libraries(livera_persistence PUBLIC livera_core SQLite::SQLite3 OpenSSL::Crypto)
livera_target_options(livera_persistence)

# --- Networking + dedicated server ------------------------------------------------
add_library(livera_server_lib
  src/net/Socket.cpp
  src/server/RateLimiter.cpp
  src/server/Server.cpp)
target_link_libraries(livera_server_lib PUBLIC livera_core livera_persistence Threads::Threads)
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
  src/client/MusicText.cpp)
target_link_libraries(livera_tests PRIVATE livera_server_lib)
target_compile_definitions(livera_tests PRIVATE LIVERA_DATA_DIR="${CMAKE_CURRENT_SOURCE_DIR}/data")
livera_target_options(livera_tests)
add_test(NAME livera_tests COMMAND livera_tests)
