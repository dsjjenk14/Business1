#pragma once

namespace livera {

// Token bucket per connection. The first anti-abuse layer: it bounds how fast any one
// client can drive the simulation, whatever the request.
class RateLimiter {
 public:
  RateLimiter(double ratePerSecond, double burst) : rate_(ratePerSecond), burst_(burst), tokens_(burst) {}
  // `now` is a monotonic time in seconds.
  bool allow(double now);

 private:
  double rate_;
  double burst_;
  double tokens_;
  double last_ = -1;
};

}  // namespace livera
