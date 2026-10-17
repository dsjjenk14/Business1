#pragma once

// Minimal self-registering test harness (no external dependency, so CI needs nothing
// beyond the compiler). Usage:
//   TEST_CASE("ledger rejects overdraft") { CHECK(x == 1); REQUIRE(ptr); }
// Run `livera_tests [filter]` to run tests whose name contains `filter`.

#include <cmath>
#include <cstdio>
#include <functional>
#include <sstream>
#include <stdexcept>
#include <string>
#include <vector>

namespace livera::test {

struct TestCase {
  const char* name;
  std::function<void()> fn;
};

inline std::vector<TestCase>& registry() {
  static std::vector<TestCase> r;
  return r;
}

struct Registrar {
  Registrar(const char* name, std::function<void()> fn) { registry().push_back({name, std::move(fn)}); }
};

struct RequireFailed : std::runtime_error {
  using std::runtime_error::runtime_error;
};

inline int& failures() {
  static int f = 0;
  return f;
}

inline void report(const char* file, int line, const std::string& expr) {
  ++failures();
  std::ostringstream os;
  os << "    " << file << ":" << line << ": CHECK(" << expr << ") failed";
  std::fprintf(stderr, "%s\n", os.str().c_str());
}

}  // namespace livera::test

#define LIVERA_CAT2(a, b) a##b
#define LIVERA_CAT(a, b) LIVERA_CAT2(a, b)
#define TEST_CASE(name)                                                                              \
  static void LIVERA_CAT(test_fn_, __LINE__)();                                                      \
  static ::livera::test::Registrar LIVERA_CAT(test_reg_, __LINE__)(name, LIVERA_CAT(test_fn_, __LINE__)); \
  static void LIVERA_CAT(test_fn_, __LINE__)()

#define CHECK(expr)                                                    \
  do {                                                                 \
    if (!(expr)) ::livera::test::report(__FILE__, __LINE__, #expr);   \
  } while (0)

#define REQUIRE(expr)                                                                   \
  do {                                                                                  \
    if (!(expr)) {                                                                      \
      ::livera::test::report(__FILE__, __LINE__, #expr);                               \
      throw ::livera::test::RequireFailed("REQUIRE(" #expr ")");                       \
    }                                                                                   \
  } while (0)

#define CHECK_NEAR(a, b, eps) CHECK(std::fabs((a) - (b)) <= (eps))
