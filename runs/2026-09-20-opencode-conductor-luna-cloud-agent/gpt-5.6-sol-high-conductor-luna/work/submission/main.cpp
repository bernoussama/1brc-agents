#include <algorithm>
#include <cerrno>
#include <cstdint>
#include <cstdio>
#include <cstring>
#include <fcntl.h>
#include <limits>
#include <pthread.h>
#include <string>
#include <sys/mman.h>
#include <sys/stat.h>
#include <unistd.h>
#include <vector>

namespace {

constexpr unsigned THREADS = 4;
constexpr unsigned TABLE_SIZE = 1024;
constexpr unsigned TABLE_MASK = TABLE_SIZE - 1;

struct Stat {
  const char *name = nullptr;
  int64_t sum = 0;
  int64_t count = 0;
  uint64_t fingerprint = 0;
  uint16_t length = 0;
  int16_t min = std::numeric_limits<int16_t>::max();
  int16_t max = std::numeric_limits<int16_t>::min();
};

struct Worker {
  const char *data;
  size_t begin;
  size_t end;
  Stat table[TABLE_SIZE];
};

static inline uint16_t load16(const char *p) {
  uint16_t value;
  std::memcpy(&value, p, sizeof(value));
  return value;
}

static inline uint32_t load32(const char *p) {
  uint32_t value;
  std::memcpy(&value, p, sizeof(value));
  return value;
}

static inline uint64_t load64(const char *p) {
  uint64_t value;
  std::memcpy(&value, p, sizeof(value));
  return value;
}

static inline uint64_t rotate_left(uint64_t value, unsigned amount) {
  return amount == 0 ? value : (value << amount) | (value >> (64 - amount));
}

static inline uint64_t avalanche(uint64_t value) {
  value ^= value >> 30;
  value *= 0xbf58476d1ce4e5b9ULL;
  value ^= value >> 27;
  value *= 0x94d049bb133111ebULL;
  return value ^ (value >> 31);
}

// The loads are all bounded by the already-known key length.  First/last
// chunks cover the short station keys without a byte-at-a-time loop.
static inline uint64_t hash_name(const char *p, size_t n) {
  if (n >= 8) {
    const uint64_t first = load64(p);
    const uint64_t last = load64(p + n - 8);
    return avalanche(first ^ rotate_left(last, static_cast<unsigned>(n & 63)) ^
                     static_cast<uint64_t>(n) * 0x9e3779b97f4a7c15ULL);
  }
  if (n >= 4) {
    const uint64_t first = load32(p);
    const uint64_t last = load32(p + n - 4);
    return avalanche((first | (last << 32)) ^
                     static_cast<uint64_t>(n) * 0x9e3779b97f4a7c15ULL);
  }
  if (n >= 2) {
    const uint64_t first = load16(p);
    const uint64_t last = load16(p + n - 2);
    return avalanche((first | (last << 16)) ^
                     static_cast<uint64_t>(n) * 0x9e3779b97f4a7c15ULL);
  }
  return avalanche((n == 0 ? 0 : static_cast<unsigned char>(*p)) ^
                   0x9e3779b97f4a7c15ULL);
}

static inline Stat *lookup(Worker *w, const char *name, size_t length) {
  const uint64_t h = hash_name(name, length);
  unsigned slot = static_cast<unsigned>(h) & TABLE_MASK;
  for (;;) {
    Stat *s = &w->table[slot];
    if (s->name == nullptr) {
      s->name = name;
      s->fingerprint = h;
      s->length = static_cast<uint16_t>(length);
      return s;
    }
    if (s->fingerprint == h && s->length == length &&
        std::memcmp(s->name, name, length) == 0)
      return s;
    slot = (slot + 1) & TABLE_MASK;
  }
}

static inline int parse_temperature(const char *p, const char *end) {
  bool negative = false;
  if (p < end && *p == '-') {
    negative = true;
    ++p;
  } else if (p < end && *p == '+') {
    ++p;
  }

  // The specified input has exactly one fractional digit.  Keep a fallback
  // for malformed-looking lines so that separator handling remains benign.
  int value = 0;
  const char *dot = static_cast<const char *>(std::memchr(p, '.', end - p));
  if (dot != nullptr && dot + 1 < end) {
    const size_t whole_digits = static_cast<size_t>(dot - p);
    if (whole_digits == 1 || whole_digits == 2) {
      value = (p[0] - '0');
      if (whole_digits == 2) value = value * 10 + (p[1] - '0');
      value = value * 10 + (dot[1] - '0');
      return negative ? -value : value;
    }
  }
  // Generic decimal parser, not used for canonical rows.
  int whole = 0;
  while (p < end && *p >= '0' && *p <= '9') {
    whole = whole * 10 + (*p - '0');
    ++p;
  }
  value = whole * 10;
  if (p < end && *p == '.') {
    ++p;
    if (p < end && *p >= '0' && *p <= '9') value += *p - '0';
  }
  return negative ? -value : value;
}

static void *worker_main(void *arg) {
  Worker *w = static_cast<Worker *>(arg);
  const char *p = w->data + w->begin;
  const char *limit = w->data + w->end;
  while (p < limit) {
    const char *nl = static_cast<const char *>(std::memchr(p, '\n', limit - p));
    const char *line_end = nl == nullptr ? limit : nl;
    if (line_end > p && line_end[-1] == '\r') --line_end;

    const char *semi = line_end;
    while (semi > p && semi[-1] != ';') --semi;
    if (semi > p && semi < line_end) {
      --semi;
      const char *temp = semi + 1;
      const size_t name_len = static_cast<size_t>(semi - p);
      Stat *s = lookup(w, p, name_len);
      const int value = parse_temperature(temp, line_end);
      s->sum += value;
      ++s->count;
      if (value < s->min) s->min = static_cast<int16_t>(value);
      if (value > s->max) s->max = static_cast<int16_t>(value);
    }
    p = nl == nullptr ? limit : nl + 1;
  }
  return nullptr;
}

struct Result {
  const char *name;
  size_t length;
  int64_t sum;
  int64_t count;
  int16_t min;
  int16_t max;
};

static inline int64_t rounded_mean(int64_t sum, int64_t count) {
  const bool negative = sum < 0;
  uint64_t magnitude = static_cast<uint64_t>(negative ? -sum : sum);
  uint64_t q = magnitude / static_cast<uint64_t>(count);
  const uint64_t r = magnitude % static_cast<uint64_t>(count);
  if (r * 2 >= static_cast<uint64_t>(count)) ++q;
  const int64_t result = static_cast<int64_t>(q);
  return negative ? -result : result;
}

static inline void append_tenths(std::string &out, int value) {
  if (value < 0) {
    out.push_back('-');
    value = -value;
  }
  out += std::to_string(value / 10);
  out.push_back('.');
  out.push_back(static_cast<char>('0' + value % 10));
}

static bool name_less(const Result &a, const Result &b) {
  const size_t common = std::min(a.length, b.length);
  const int c = std::memcmp(a.name, b.name, common);
  return c != 0 ? c < 0 : a.length < b.length;
}

static bool write_all(const char *p, size_t n) {
  while (n != 0) {
    const ssize_t written = ::write(STDOUT_FILENO, p, n);
    if (written < 0) {
      if (errno == EINTR) continue;
      return false;
    }
    if (written == 0) return false;
    p += written;
    n -= static_cast<size_t>(written);
  }
  return true;
}

} // namespace

int main(int argc, char **argv) {
  if (argc != 2) return 2;
  const int fd = ::open(argv[1], O_RDONLY | O_CLOEXEC);
  if (fd < 0) return 2;

  struct stat st {};
  if (::fstat(fd, &st) != 0 || st.st_size < 0) {
    ::close(fd);
    return 2;
  }
  const size_t size = static_cast<size_t>(st.st_size);
  if (size == 0) {
    ::close(fd);
    return write_all("{}", 2) ? 0 : 1;
  }
  void *mapped = ::mmap(nullptr, size, PROT_READ, MAP_PRIVATE, fd, 0);
  ::close(fd);
  if (mapped == MAP_FAILED) return 2;
  const char *data = static_cast<const char *>(mapped);
  (void)::madvise(mapped, size, MADV_SEQUENTIAL);

  Worker workers[THREADS]{};
  pthread_t threads[THREADS];
  size_t starts[THREADS + 1]{};
  starts[0] = 0;
  for (unsigned i = 1; i < THREADS; ++i) {
    size_t at = (size * i) / THREADS;
    while (at < size && at != 0 && data[at - 1] != '\n') ++at;
    starts[i] = at;
  }
  starts[THREADS] = size;

  unsigned created = 0;
  for (unsigned i = 0; i < THREADS; ++i) {
    workers[i].data = data;
    workers[i].begin = starts[i];
    workers[i].end = starts[i + 1];
    if (pthread_create(&threads[i], nullptr, worker_main, &workers[i]) != 0)
      break;
    ++created;
  }
  if (created != THREADS) {
    for (unsigned i = 0; i < created; ++i) pthread_join(threads[i], nullptr);
    ::munmap(mapped, size);
    return 2;
  }
  for (unsigned i = 0; i < THREADS; ++i) pthread_join(threads[i], nullptr);

  std::vector<Result> results;
  results.reserve(413);
  for (unsigned t = 0; t < THREADS; ++t) {
    for (unsigned i = 0; i < TABLE_SIZE; ++i) {
      const Stat &s = workers[t].table[i];
      if (s.name == nullptr) continue;
      bool found = false;
      for (Result &r : results) {
        if (r.length == s.length && std::memcmp(r.name, s.name, s.length) == 0) {
          r.sum += s.sum;
          r.count += s.count;
          if (s.min < r.min) r.min = s.min;
          if (s.max > r.max) r.max = s.max;
          found = true;
          break;
        }
      }
      if (!found)
        results.push_back({s.name, s.length, s.sum, s.count, s.min, s.max});
    }
  }
  std::sort(results.begin(), results.end(), name_less);

  std::string output;
  output.reserve(results.size() * 32 + 2);
  output.push_back('{');
  for (size_t i = 0; i < results.size(); ++i) {
    if (i != 0) output += ", ";
    const Result &r = results[i];
    output.append(r.name, r.length);
    output.push_back('=');
    append_tenths(output, r.min);
    output.push_back('/');
    append_tenths(output, static_cast<int>(rounded_mean(r.sum, r.count)));
    output.push_back('/');
    append_tenths(output, r.max);
  }
  output.push_back('}');

  const bool okay = write_all(output.data(), output.size());
  ::munmap(mapped, size);
  return okay ? 0 : 1;
}
