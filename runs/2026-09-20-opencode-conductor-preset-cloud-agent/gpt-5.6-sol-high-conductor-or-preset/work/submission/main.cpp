// 1BRC Round A experimental candidate: key-arena + AVX key equality.
//
// Active-untouched experiment. Derived from temp4 active. Goal: eliminate the
// per-row libc memcmp on the hot hit path by comparing the already-loaded
// first 32-byte AVX vector against a copy of the key bytes stored in a
// contiguous per-thread key arena, indexed by a stable uint32 key id.
//
// Design:
//   * mmap input, split into newline-aligned disjoint chunks (temp4).
//   * Per-thread LocalMap has an open-addressing Entry table and a parallel
//     KeyRec arena. Entry stores key_id_plus1 (0 == empty), len, mn, mx, sum,
//     cnt => exactly 32 bytes. KeyRec stores the original name pointer (for
//     len > 32 memcmp, output, and rehash) plus 32 copied key bytes.
//   * process_segment passes the first 32-byte AVX vector and a vecvalid flag.
//     Hot path (vecvalid && len <= 32): load arena 32 bytes, vpcmpeqb vs the
//     input vector, movemask, require all low `len` bits set (low_mask via
//     _bzhi_u32 when BMI2, else shift). This ignores temperature bytes that
//     follow the name in the vector, so it compares only real name bytes.
//   * len > 32 or !vecvalid: exact memcmp against the arena's original
//     pointer. Scalar/boundary names never overread (len < 32 there).
//   * Hash formula, cap 8192, temperature parsing unchanged from temp4.
//   * Growth doubles table + arena, preserving key ids; rehash hashes from
//     the original name pointer (len > 32 needs > 32 bytes).
#include <cstdint>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <string>
#include <vector>
#include <thread>
#include <algorithm>
#include <unistd.h>
#include <fcntl.h>
#include <sys/mman.h>
#include <sys/stat.h>

#if defined(__AVX2__)
#include <immintrin.h>
#endif

namespace {

// 32 bytes exactly: key id + stats. key_plus1 == 0 means empty slot.
struct Entry {
    uint32_t key_plus1 = 0;
    uint32_t len = 0;
    int32_t mn = 0;
    int32_t mx = 0;
    int64_t sum = 0;
    int64_t cnt = 0;
};
static_assert(sizeof(Entry) == 32, "Entry must be 32 bytes");

// One arena record: original name pointer + first 32 safely loadable bytes.
// No alignas(32) on purpose: 40-byte records keep the arena compact, and all
// vector accesses use unaligned loadu/storeu.
struct KeyRec {
    const char* orig;
    char bytes[32];
};

#if defined(__AVX2__)
using KeyVec = __m256i;
#else
using KeyVec = int;
#endif

// Low `n` bits set (n in [0,32]); n == 32 -> all ones.
inline uint32_t low_mask(uint32_t n) {
#if defined(__BMI2__)
    return _bzhi_u32(0xFFFFFFFFu, n);
#else
    return (n >= 32) ? 0xFFFFFFFFu : ((1u << n) - 1u);
#endif
}

// Load the first min(n, 8) name bytes, zero-filling the rest (bounds-safe).
inline uint64_t load_first8(const char* p, uint32_t n) {
    uint64_t a = 0;
    if (n >= 8) std::memcpy(&a, p, 8);
    else if (n > 0) std::memcpy(&a, p, n);
    return a;
}

// temp4 hash: pure function of the name bytes. `a` is the caller's first-8
// load; for n < 8 the unused high bytes are masked off. Tail read for n > 8.
inline uint64_t hash_a(uint64_t a, const char* p, uint32_t n) {
    uint64_t b = 0;
    if (n > 8) {
        std::memcpy(&b, p + n - 8, 8);
    } else if (n < 8) {
        a &= (n ? ((1ULL << (8 * n)) - 1) : 0ULL);
    }
    uint64_t h = a ^ ((b << 32) | (b >> 32)) ^
                 (0x9E3779B97F4A7C15ULL + static_cast<uint64_t>(n));
    h ^= h >> 33;
    h *= 0xFF51AFD7ED558CCDULL;
    h ^= h >> 29;
    return h;
}

// Generic path for rehash (no preloaded prefix, must read len bytes).
inline uint64_t hash_bytes(const char* p, uint32_t n) {
    return hash_a(load_first8(p, n), p, n);
}

struct LocalMap {
    Entry* tab = nullptr;
    KeyRec* keys = nullptr;
    uint32_t cap = 0;    // power of two
    uint32_t mask = 0;
    uint32_t sz = 0;
    uint32_t nkeys = 0;

    void init(uint32_t c) {
        cap = c;
        mask = cap - 1;
        tab = static_cast<Entry*>(std::calloc(cap, sizeof(Entry)));
        keys = static_cast<KeyRec*>(std::malloc(cap * sizeof(KeyRec)));
        sz = 0;
        nkeys = 0;
    }

    void grow() {
        uint32_t ncap = cap << 1;
        Entry* ntab = static_cast<Entry*>(std::calloc(ncap, sizeof(Entry)));
        KeyRec* nkeys = static_cast<KeyRec*>(std::malloc(ncap * sizeof(KeyRec)));
        // Key ids are stable indices; copy the used prefix verbatim.
        std::memcpy(nkeys, keys, nkeys_count() * sizeof(KeyRec));
        uint32_t nmask = ncap - 1;
        for (uint32_t i = 0; i < cap; ++i) {
            if (!tab[i].key_plus1) continue;
            const KeyRec& kr = keys[tab[i].key_plus1 - 1];
            uint64_t h = hash_bytes(kr.orig, tab[i].len);
            uint32_t j = static_cast<uint32_t>(h) & nmask;
            while (ntab[j].key_plus1) j = (j + 1) & nmask;
            ntab[j] = tab[i];
        }
        std::free(tab);
        std::free(keys);
        tab = ntab;
        keys = nkeys;
        cap = ncap;
        mask = nmask;
    }

    uint32_t nkeys_count() const { return nkeys; }

    // Copy 32 key bytes into the arena record. If the input vector is valid it
    // is a pure copy of the first 32 input bytes; otherwise zero-pad and copy
    // only len bytes (len < 32 on the scalar path, so this never overreads).
    static inline void store_key(KeyRec& kr, const char* name, uint32_t len,
                                 KeyVec c, bool vecvalid) {
#if defined(__AVX2__)
        if (vecvalid) {
            _mm256_storeu_si256(reinterpret_cast<__m256i*>(kr.bytes), c);
            return;
        }
#else
        (void)c;
#endif
        std::memset(kr.bytes, 0, 32);
        uint32_t n = len < 32 ? len : 32;
        if (n) std::memcpy(kr.bytes, name, n);
    }

    // Exact equality of (name,len) with arena record kr. Hot path: all of the
    // first len <= 32 bytes via one 32-byte vector compare. The arena bytes
    // and the input vector are both copies of the same offsets, so comparing
    // only the low len bits ignores the ';'/temperature bytes that follow the
    // name in either buffer. Fallback is an exact memcmp of len bytes.
    static inline bool key_eq(const KeyRec& kr, const char* name, uint32_t len,
                              KeyVec c, bool vecvalid) {
#if defined(__AVX2__)
        if (vecvalid && len <= 32) {
            __m256i kv = _mm256_loadu_si256(
                reinterpret_cast<const __m256i*>(kr.bytes));
            __m256i eq = _mm256_cmpeq_epi8(kv, c);
            uint32_t m = static_cast<uint32_t>(_mm256_movemask_epi8(eq));
            uint32_t full = low_mask(len);
            return (m & full) == full;
        }
#else
        (void)c;
        (void)vecvalid;
#endif
        return std::memcmp(kr.orig, name, len) == 0;
    }

    __attribute__((always_inline)) inline void add(const char* name, uint32_t len,
                                                   int32_t v, uint64_t a,
                                                   KeyVec c, bool vecvalid) {
        const uint64_t h = hash_a(a, name, len);
        uint32_t j = static_cast<uint32_t>(h) & mask;
        for (;;) {
            Entry& e = tab[j];
            uint32_t kp = e.key_plus1;
            if (!kp) {
                // Growth test moved here: existing-key hits never run it.
                if (sz * 5 >= cap * 3) {  // load factor <= 0.6
                    grow();
                    j = static_cast<uint32_t>(h) & mask;
                    continue;
                }
                uint32_t kid = nkeys++;
                KeyRec& kr = keys[kid];
                kr.orig = name;
                store_key(kr, name, len, c, vecvalid);
                e.key_plus1 = kid + 1;
                e.len = len;
                e.mn = v;
                e.mx = v;
                e.sum = v;
                e.cnt = 1;
                ++sz;
                return;
            }
            if (e.len == len && key_eq(keys[kp - 1], name, len, c, vecvalid)) {
                if (v < e.mn) e.mn = v;
                if (v > e.mx) e.mx = v;
                e.sum += v;
                ++e.cnt;
                return;
            }
            j = (j + 1) & mask;
        }
    }
};

// Flattened output record; name resolved through the owning LocalMap's arena.
struct OutEntry {
    const char* name;
    uint32_t len;
    int32_t mn;
    int32_t mx;
    int64_t sum;
    int64_t cnt;
};

// Scan and parse one segment. The first 32-byte AVX2 block loaded at the row
// start is reused: its low 8 bytes feed the hash and the whole vector feeds
// the key-arena equality test.
//
// Bounds safety: a 32-byte vector load is only issued when the whole load is
// in bounds (p + 32 <= end); the scalar tail is bounded by `end`, so nothing
// reads past the segment (hence past the mapping). vecvalid records whether
// the vector at the row start was loadable.
void process_segment(const char* begin, const char* end, LocalMap& m) {
    const char* p = begin;
#if defined(__AVX2__)
    const __m256i semi = _mm256_set1_epi8(';');
    const __m256i zero = _mm256_setzero_si256();
#endif
    while (p < end) {
        const char* ns = p;
        uint64_t a;
        KeyVec c;
        bool vecvalid;
#if defined(__AVX2__)
        if (p + 32 <= end) {
            __m256i v = _mm256_loadu_si256(reinterpret_cast<const __m256i*>(p));
            c = v;
            vecvalid = true;
            a = static_cast<uint64_t>(
                _mm_cvtsi128_si64(_mm256_castsi256_si128(v)));
            unsigned mask =
                static_cast<unsigned>(_mm256_movemask_epi8(_mm256_cmpeq_epi8(v, semi)));
            if (mask) {
                p += __builtin_ctz(mask);
            } else {
                // Name longer than 32 bytes: scan further whole blocks, then
                // a bounds-safe scalar tail near `end`.
                const char* q = p + 32;
                for (;;) {
                    if (q + 32 <= end) {
                        __m256i v2 = _mm256_loadu_si256(
                            reinterpret_cast<const __m256i*>(q));
                        unsigned m2 = static_cast<unsigned>(
                            _mm256_movemask_epi8(_mm256_cmpeq_epi8(v2, semi)));
                        if (m2) { q += __builtin_ctz(m2); break; }
                        q += 32;
                    } else {
                        while (q < end && *q != ';') ++q;
                        break;
                    }
                }
                p = q;
            }
        } else {
            while (p < end && *p != ';') ++p;
            uint32_t len0 = static_cast<uint32_t>(p - ns);
            a = load_first8(ns, len0);
            c = zero;
            vecvalid = false;
        }
#else
        while (p < end && *p != ';') ++p;
        uint32_t len0 = static_cast<uint32_t>(p - ns);
        a = load_first8(ns, len0);
        vecvalid = false;
#endif
        uint32_t len = static_cast<uint32_t>(p - ns);
        ++p;  // skip ';'

        // Hot temperature decode: optional '-', then the digit/dot body. The
        // body is 3 bytes (d'.'d) or 4 bytes (dd'.'d), so a single 4-byte load
        // at q is always in bounds. Two candidate values are computed and
        // selected with a bit-mask; sign is applied branchlessly.
        uint32_t neg = static_cast<uint32_t>(*p == '-');
        const char* q = p + neg;
        uint32_t w;
        std::memcpy(&w, q, 4);  // LE x86
        uint32_t b0 = w & 0xffu, b1 = (w >> 8) & 0xffu;
        uint32_t b2 = (w >> 16) & 0xffu, b3 = (w >> 24) & 0xffu;
        uint32_t two = static_cast<uint32_t>(b1 != static_cast<uint32_t>('.'));
        uint32_t d0 = b0 - '0', d1 = b1 - '0';
        uint32_t v1 = d0 * 10u + (b2 - '0');                  // D = 3
        uint32_t v2 = (d0 * 10u + d1) * 10u + (b3 - '0');     // D = 4
        uint32_t mask = 0u - two;
        uint32_t uv = (v1 & ~mask) | (v2 & mask);
        uint32_t nmask = 0u - neg;
        int32_t v = static_cast<int32_t>((uv ^ nmask) - nmask);
        p = q + 4 + two;  // body + '\n' (input newline-terminated)
        m.add(ns, len, v, a, c, vecvalid);
    }
}

inline void append_int(std::string& out, uint64_t x) {
    char buf[24];
    int n = 0;
    do { buf[n++] = static_cast<char>('0' + (x % 10)); x /= 10; } while (x);
    while (n) out.push_back(buf[--n]);
}

// Value in tenths -> one-decimal text, no "-0.0".
inline void append_tenths(std::string& out, int32_t t) {
    uint32_t a = (t < 0) ? static_cast<uint32_t>(-static_cast<int64_t>(t))
                         : static_cast<uint32_t>(t);
    if (t < 0) out.push_back('-');
    append_int(out, a / 10u);
    out.push_back('.');
    out.push_back(static_cast<char>('0' + (a % 10u)));
}

// round(|sum|/cnt) with ties away from zero, sign applied.
inline int32_t mean_tenths(int64_t sum, int64_t cnt) {
    uint64_t a = (sum < 0) ? static_cast<uint64_t>(-sum) : static_cast<uint64_t>(sum);
    uint64_t d = static_cast<uint64_t>(cnt);
    uint64_t q = a / d;
    uint64_t r = a - q * d;
    if (r * 2 >= d) ++q;
    return (sum < 0) ? -static_cast<int32_t>(q) : static_cast<int32_t>(q);
}

}  // namespace

int main(int argc, char** argv) {
    if (argc != 2) {
        std::fprintf(stderr, "usage: %s <input>\n", argv[0]);
        return 2;
    }
    int fd = open(argv[1], O_RDONLY);
    if (fd < 0) { perror("open"); return 1; }
    struct stat st;
    if (fstat(fd, &st) != 0) { perror("fstat"); return 1; }
    size_t fsz = static_cast<size_t>(st.st_size);
    if (fsz == 0) { std::fputs("{}", stdout); return 0; }

    const char* data =
        static_cast<const char*>(mmap(nullptr, fsz, PROT_READ, MAP_PRIVATE, fd, 0));
    if (data == MAP_FAILED) { perror("mmap"); return 1; }
    madvise(const_cast<char*>(data), fsz, MADV_SEQUENTIAL);

    constexpr unsigned kThreads = 4;
    unsigned nthreads = kThreads;
    const char* env = std::getenv("NTHREADS");
    if (env) {
        long t = std::strtol(env, nullptr, 10);
        if (t >= 1 && t <= 256) nthreads = static_cast<unsigned>(t);
    }
    if (static_cast<size_t>(nthreads) > fsz) nthreads = static_cast<unsigned>(fsz);

    // Newline-aligned disjoint chunks: boundary i is the first byte of a line.
    size_t chunk = fsz / nthreads;
    std::vector<size_t> bounds(nthreads + 1);
    bounds[0] = 0;
    for (unsigned i = 1; i < nthreads; ++i) {
        size_t pos = chunk * i;
        const char* nl = static_cast<const char*>(
            std::memchr(data + pos, '\n', fsz - pos));
        bounds[i] = nl ? static_cast<size_t>(nl - data) + 1 : fsz;
    }
    bounds[nthreads] = fsz;

    std::vector<LocalMap> maps(nthreads);
    std::vector<std::thread> threads;
    threads.reserve(nthreads);
    for (unsigned i = 0; i < nthreads; ++i) {
        maps[i].init(8192);
        threads.emplace_back([&, i]() {
            process_segment(data + bounds[i], data + bounds[i + 1], maps[i]);
        });
    }
    for (auto& th : threads) th.join();

    // Resolve key ids to original name pointers into a flattened array.
    std::vector<OutEntry> all;
    size_t total = 0;
    for (auto& m : maps) total += m.sz;
    all.reserve(total);
    for (auto& m : maps)
        for (uint32_t i = 0; i < m.cap; ++i) {
            const Entry& e = m.tab[i];
            if (!e.key_plus1) continue;
            const KeyRec& kr = m.keys[e.key_plus1 - 1];
            all.push_back(OutEntry{kr.orig, e.len, e.mn, e.mx, e.sum, e.cnt});
        }

    // Unsigned byte-wise order (memcmp semantics); ties broken by length.
    std::sort(all.begin(), all.end(), [](const OutEntry& a, const OutEntry& b) {
        uint32_t n = a.len < b.len ? a.len : b.len;
        int c = n ? std::memcmp(a.name, b.name, n) : 0;
        if (c != 0) return c < 0;
        return a.len < b.len;
    });

    std::string out;
    out.reserve(413 * 32 + 2);
    out.push_back('{');
    size_t i = 0;
    bool first = true;
    while (i < all.size()) {
        size_t j = i + 1;
        while (j < all.size() && all[j].len == all[i].len &&
               std::memcmp(all[j].name, all[i].name, all[i].len) == 0)
            ++j;
        int32_t mn = all[i].mn, mx = all[i].mx;
        int64_t sum = 0, cnt = 0;
        for (size_t k = i; k < j; ++k) {
            if (all[k].mn < mn) mn = all[k].mn;
            if (all[k].mx > mx) mx = all[k].mx;
            sum += all[k].sum;
            cnt += all[k].cnt;
        }
        if (!first) out.append(", ");
        first = false;
        out.append(all[i].name, all[i].len);
        out.push_back('=');
        append_tenths(out, mn);
        out.push_back('/');
        append_tenths(out, mean_tenths(sum, cnt));
        out.push_back('/');
        append_tenths(out, mx);
        i = j;
    }
    out.push_back('}');

    size_t off = 0;
    while (off < out.size()) {
        ssize_t w = write(1, out.data() + off, out.size() - off);
        if (w <= 0) { perror("write"); return 1; }
        off += static_cast<size_t>(w);
    }
    return 0;
}
