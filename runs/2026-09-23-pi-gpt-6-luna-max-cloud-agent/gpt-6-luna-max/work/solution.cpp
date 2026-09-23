#define _GNU_SOURCE
#include <algorithm>
#include <cstdint>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <thread>
#include <immintrin.h>
#include <sys/mman.h>
#include <sys/stat.h>
#include <fcntl.h>
#include <unistd.h>

#ifndef THREADS
#define THREADS 4
#endif
#ifndef TABLE_SIZE
#define TABLE_SIZE 1024
#endif
#ifndef HASH_STYLE
#define HASH_STYLE 0
#endif
#ifndef TEMP_STYLE
#define TEMP_STYLE 0
#endif
#ifndef TAIL_STYLE
#define TAIL_STYLE 0
#endif
#ifndef SEP_STYLE
#define SEP_STYLE 0
#endif
#ifndef MASK_STYLE
#define MASK_STYLE 0
#endif
#ifndef MADVISE_STYLE
#define MADVISE_STYLE 1
#endif
#ifndef PREFETCH_STYLE
#define PREFETCH_STYLE 0
#endif
struct alignas(64) Entry {
    uint64_t keylo;
    const char *name;
    uint64_t keyhi, keytail;
    int64_t sum, count;
    int16_t minv, maxv;
    uint16_t len;
};
struct Worker {
    Entry table[TABLE_SIZE];
    const char *begin, *end, *mapend;
};

static inline bool tail_equal(const Entry *e, const char *name, uint64_t keytail, uint32_t len) {
    if (len <= 16) return true;
    if (e->keytail != keytail) return false;
    return len <= 24 || !memcmp(e->name + 24, name + 24, len - 24);
}

static void process(Worker *w) {
    const char *p = w->begin;
    const char *end = w->end;
#if SEP_STYLE == 0
    const __m256i semicolon = _mm256_set1_epi8(';');
#else
    const __m512i semicolon = _mm512_set1_epi8(';');
    const char *scanbase = nullptr;
    uint64_t separators = 0;
#endif
#if MASK_STYLE == 0
    static const uint64_t masks[9] = {
        0, 0xffULL, 0xffffULL, 0xffffffULL, 0xffffffffULL,
        0xffffffffffULL, 0xffffffffffffULL, 0xffffffffffffffULL, UINT64_MAX
    };
#endif
    while (p < end) {
        const char *name = p;
        const char *semi = nullptr;
#if SEP_STYLE == 0
        while (w->mapend - p >= 32) {
            __m256i bytes = _mm256_loadu_si256((const __m256i *)p);
            unsigned bits = (unsigned)_mm256_movemask_epi8(_mm256_cmpeq_epi8(bytes, semicolon));
            if (bits) { semi = p + __builtin_ctz(bits); break; }
            p += 32;
        }
        if (semi) p = semi;
        else while (*p != ';') ++p;
#elif SEP_STYLE == 1
        if (__builtin_expect(scanbase != nullptr, 1) && p >= scanbase && p - scanbase < 64) {
            uint64_t future = separators >> (p - scanbase);
            if (__builtin_expect(future != 0, 1)) semi = p + __builtin_ctzll(future);
        }
        if (__builtin_expect(semi == nullptr, 0)) {
            scanbase = nullptr;
            if (w->mapend - p >= 64) {
                scanbase = p;
                separators = (uint64_t)_mm512_cmpeq_epi8_mask(_mm512_loadu_si512((const void *)p), semicolon);
                if (separators) semi = p + __builtin_ctzll(separators);
            }
        }
        if (__builtin_expect(semi != nullptr, 1)) p = semi;
        else while (*p != ';') ++p;
#else
        if (separators) semi = p + __builtin_ctzll(separators);
        else {
            scanbase = p;
            if (w->mapend - p >= 64) {
                separators = (uint64_t)_mm512_cmpeq_epi8_mask(_mm512_loadu_si512((const void *)p), semicolon);
                if (separators) semi = p + __builtin_ctzll(separators);
            }
        }
        if (semi) p = semi;
        else while (*p != ';') ++p;
#endif
        uint32_t len = (uint32_t)(p - name);
        uint64_t keylo, keyhi;
#if MASK_STYLE == 2
        uint32_t nkey = len < 16 ? len : 16;
        __mmask16 keymask = (__mmask16)(0xffffu >> (16 - nkey));
        __m128i packed = _mm_maskz_loadu_epi8(keymask, name);
        keylo = (uint64_t)_mm_cvtsi128_si64(packed);
        keyhi = (uint64_t)_mm_extract_epi64(packed, 1);
#else
        keyhi = 0;
        if (w->mapend - name >= 16) {
            memcpy(&keylo, name, 8);
            memcpy(&keyhi, name + 8, 8);
        } else {
            keylo = keyhi = 0;
            size_t nlo = len < 8 ? len : 8;
            memcpy(&keylo, name, nlo);
            if (len > 8) memcpy(&keyhi, name + 8, len - 8);
        }
#if MASK_STYLE == 0
        keylo &= masks[len < 8 ? len : 8];
        keyhi &= masks[len <= 8 ? 0 : (len - 8 < 8 ? len - 8 : 8)];
#else
        uint32_t nlo = len < 8 ? len : 8;
        uint32_t nhi = len <= 8 ? 0 : (len - 8 < 8 ? len - 8 : 8);
        keylo &= UINT64_MAX >> ((8 - nlo) * 8);
        keyhi &= nhi ? (UINT64_MAX >> ((8 - nhi) * 8)) : 0;
#endif
#endif
        uint64_t keytail = 0;
        if (len > 16) {
            uint32_t n = len - 16;
            if (w->mapend - name >= 24) memcpy(&keytail, name + 16, 8);
            else memcpy(&keytail, name + 16, n);
#if MASK_STYLE == 0
            keytail &= masks[n < 8 ? n : 8];
#else
            uint32_t ntail = n < 8 ? n : 8;
            keytail &= UINT64_MAX >> ((8 - ntail) * 8);
#endif
        }
        uint32_t h = (uint32_t)(keylo ^ (keylo >> 32) ^ keyhi ^ (keyhi >> 32)) ^ (len * 0x9e3779b9u);
#if HASH_STYLE == 0
        h ^= h >> 16;
        h *= 0x7feb352du;
        h ^= h >> 15;
#elif HASH_STYLE == 2
        h = (uint32_t)(keylo ^ keyhi) ^ (len * 0x9e3779b9u);
#elif HASH_STYLE == 3
        uint64_t crc = _mm_crc32_u64(0, keylo);
        crc = _mm_crc32_u64((uint32_t)crc, keyhi);
        crc = _mm_crc32_u32((uint32_t)crc, len);
        h = (uint32_t)crc;
#elif HASH_STYLE == 4
        uint32_t c1 = (uint32_t)_mm_crc32_u64(0, keylo);
        uint32_t c2 = (uint32_t)_mm_crc32_u64(0, keyhi);
        h = c1 ^ ((c2 << 13) | (c2 >> 19)) ^ (len * 0x9e3779b9u);
#elif HASH_STYLE == 5
        uint32_t c1 = (uint32_t)_mm_crc32_u64(0, keylo);
        uint32_t c2 = (uint32_t)_mm_crc32_u64(0, keyhi);
        h = c1 ^ ((c2 << 13) | (c2 >> 19)) ^ len;
#elif HASH_STYLE == 6
        uint32_t c1 = (uint32_t)_mm_crc32_u64(0, keylo);
        uint32_t c2 = (uint32_t)_mm_crc32_u64(0, keyhi);
        h = c1 ^ c2 ^ len;
#elif HASH_STYLE == 7
        uint32_t c1 = (uint32_t)_mm_crc32_u64(len, keylo);
        uint32_t c2 = (uint32_t)_mm_crc32_u64(0, keyhi);
        h = c1 ^ ((c2 << 13) | (c2 >> 19));
#elif HASH_STYLE == 8
        uint32_t c1 = (uint32_t)_mm_crc32_u64(len, keylo);
        uint32_t c2 = (uint32_t)_mm_crc32_u64(len, keyhi);
        h = c1 ^ ((c2 << 13) | (c2 >> 19));
#elif HASH_STYLE == 9
        uint32_t c1 = (uint32_t)_mm_crc32_u64(len, keylo);
        uint32_t c2 = (uint32_t)_mm_crc32_u64(0, keyhi);
        h = c1 ^ c2;
#elif HASH_STYLE == 10
        uint32_t c1 = (uint32_t)_mm_crc32_u64(len, keylo);
        uint32_t c2 = (uint32_t)_mm_crc32_u64(len, keyhi);
        h = c1 ^ c2;
#endif
        Entry *bucket = w->table + (h & (TABLE_SIZE - 1));
#if PREFETCH_STYLE == 1
        __builtin_prefetch(bucket, 0, 3);
#endif
        ++p;
        int v;
#if TEMP_STYLE == 0
        bool neg = (*p == '-');
        if (neg) ++p;
        int whole = *p++ - '0';
        if (*p != '.') whole = whole * 10 + (*p++ - '0');
        ++p;
        v = whole * 10 + (*p++ - '0');
        if (neg) v = -v;
        ++p; // newline
#else
        int neg = (*p == '-');
        p += neg;
        int d0 = *p - '0';
        int two = (p[1] != '.');
        int d1 = p[1] - '0';
        int whole = d0 + two * (d0 * 9 + d1);
        v = whole * 10 + (p[2 + two] - '0');
        v = (v ^ -neg) + neg;
        p += 4 + two; // number plus newline
#endif

        Entry *e = bucket;
        while (e->keylo) {
            if (e->keylo == keylo && e->len == len && e->keyhi == keyhi &&
                tail_equal(e, name, keytail, len)) break;
            if (++e == w->table + TABLE_SIZE) e = w->table;
        }
        if (!e->keylo) {
            e->keylo = keylo;
            e->name = name;
            e->len = len;
            e->keyhi = keyhi;
            e->keytail = keytail;
            e->minv = e->maxv = v;
            e->sum = v;
            e->count = 1;
        } else {
            if (v < e->minv) e->minv = v;
            if (v > e->maxv) e->maxv = v;
            e->sum += v;
            ++e->count;
        }
#if SEP_STYLE == 2
        if (scanbase) {
            auto advanced = p - scanbase;
            if (advanced < 64) {
                separators >>= advanced;
                scanbase = p;
            } else {
                separators = 0;
                scanbase = nullptr;
            }
        }
#endif
    }
}

static int namecmp(const Entry *a, const Entry *b) {
    size_t n = a->len < b->len ? a->len : b->len;
    int c = memcmp(a->name, b->name, n);
    if (c) return c;
    return (a->len > b->len) - (a->len < b->len);
}
static int ptrcmp(const void *aa, const void *bb) {
    return namecmp(*(Entry * const *)aa, *(Entry * const *)bb);
}

static char *put_uint(char *p, uint64_t v) {
    char tmp[24];
    int n = 0;
    do { tmp[n++] = (char)('0' + v % 10); v /= 10; } while (v);
    while (n) *p++ = tmp[--n];
    return p;
}
static char *put_tenths(char *p, int64_t v) {
    uint64_t x;
    if (v < 0) { *p++ = '-'; x = (uint64_t)(-v); }
    else x = (uint64_t)v;
    p = put_uint(p, x / 10);
    *p++ = '.';
    *p++ = (char)('0' + x % 10);
    return p;
}

int main(int argc, char **argv) {
    if (argc < 2) return 2;
    int fd = open(argv[1], O_RDONLY);
    if (fd < 0) return 2;
    struct stat st;
    if (fstat(fd, &st) || st.st_size <= 0) { close(fd); return 2; }
    size_t size = (size_t)st.st_size;
    const char *data = (const char *)mmap(nullptr, size, PROT_READ, MAP_PRIVATE, fd, 0);
    close(fd);
    if (data == MAP_FAILED) return 2;
#if MADVISE_STYLE == 1
    madvise((void *)data, size, MADV_SEQUENTIAL);
#elif MADVISE_STYLE == 2
    madvise((void *)data, size, MADV_SEQUENTIAL);
    madvise((void *)data, size, MADV_HUGEPAGE);
#endif

    Worker workers[THREADS]{};
    workers[0].begin = data;
    for (int i = 0; i < THREADS; ++i) workers[i].mapend = data + size;
    for (int i = 1; i < THREADS; ++i) {
        size_t at = size * (size_t)i / THREADS;
        while (at < size && data[at - 1] != '\n') ++at;
        workers[i].begin = data + at;
        workers[i - 1].end = data + at;
    }
    workers[THREADS - 1].end = data + size;
    std::thread threads[THREADS - 1];
    for (int i = 1; i < THREADS; ++i) threads[i - 1] = std::thread(process, workers + i);
    process(workers);
    for (auto &t : threads) t.join();

    Entry *ordered[THREADS * TABLE_SIZE];
    int total = 0;
    for (int i = 0; i < THREADS; ++i)
        for (auto &e : workers[i].table) if (e.name) ordered[total++] = &e;
    qsort(ordered, total, sizeof(Entry *), ptrcmp);

    char output[131072];
    char *o = output;
    *o++ = '{';
    int i = 0;
    bool first = true;
    while (i < total) {
        Entry *e = ordered[i++];
        int32_t minv = e->minv, maxv = e->maxv;
        int64_t sum = e->sum, count = e->count;
        while (i < total && namecmp(e, ordered[i]) == 0) {
            Entry *x = ordered[i++];
            if (x->minv < minv) minv = x->minv;
            if (x->maxv > maxv) maxv = x->maxv;
            sum += x->sum;
            count += x->count;
        }
        if (!first) { *o++ = ','; *o++ = ' '; }
        first = false;
        memcpy(o, e->name, e->len); o += e->len;
        *o++ = '=';
        o = put_tenths(o, minv); *o++ = '/';
        uint64_t mag = sum < 0 ? (uint64_t)(-sum) : (uint64_t)sum;
        uint64_t q = mag / (uint64_t)count;
        uint64_t r = mag % (uint64_t)count;
        if (r >= ((uint64_t)count + 1) / 2) ++q;
        int64_t mean = sum < 0 ? -(int64_t)q : (int64_t)q;
        o = put_tenths(o, mean); *o++ = '/';
        o = put_tenths(o, maxv);
    }
    *o++ = '}';
    fwrite(output, 1, (size_t)(o - output), stdout);
    munmap((void *)data, size);
    return 0;
}
