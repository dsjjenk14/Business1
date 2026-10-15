#include <cstdio>
#include <cstring>
#include <exception>

#include "TestHarness.h"

int main(int argc, char** argv) {
  const char* filter = argc > 1 ? argv[1] : nullptr;
  int run = 0;
  int failedTests = 0;
  for (const auto& t : livera::test::registry()) {
    if (filter && !std::strstr(t.name, filter)) continue;
    ++run;
    const int before = livera::test::failures();
    try {
      t.fn();
    } catch (const livera::test::RequireFailed&) {
    } catch (const std::exception& e) {
      ++livera::test::failures();
      std::fprintf(stderr, "    unexpected exception: %s\n", e.what());
    }
    const bool ok = livera::test::failures() == before;
    if (!ok) ++failedTests;
    std::printf("%s %s\n", ok ? "  ok  " : "  FAIL", t.name);
  }
  std::printf("\n%d tests, %d failed\n", run, failedTests);
  return failedTests == 0 && run > 0 ? 0 : 1;
}
