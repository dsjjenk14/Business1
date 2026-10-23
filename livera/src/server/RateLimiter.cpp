#include "server/RateLimiter.h"

#include <algorithm>

namespace livera {

bool RateLimiter::allow(double now) {
  if (last_ >= 0) tokens_ = std::min(burst_, tokens_ + (now - last_) * rate_);
  last_ = now;
  if (tokens_ < 1) return false;
  tokens_ -= 1;
  return true;
}

}  // namespace livera
