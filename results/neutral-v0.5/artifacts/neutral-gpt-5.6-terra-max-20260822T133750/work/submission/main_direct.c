#define _GNU_SOURCE
#include <fcntl.h>
#include <immintrin.h>
#include <limits.h>
#include <pthread.h>
#include <stdint.h>
#include <stdio.h>
#include <string.h>
#include <sys/mman.h>
#include <sys/stat.h>
#include <sys/types.h>
#include <unistd.h>

#include "stations.h"
#include "direct_map.h"

#ifndef THREADS
#define THREADS 6
#endif

typedef struct {
    int64_t sum;
    uint32_t count;
    int16_t min;
    int16_t max;
} Stats;

typedef struct {
    const char *begin;
    const char *end;
    const char *simd_limit;
    Stats stats[STATION_COUNT];
} Worker;

static inline uint64_t first_word(const char *p) {
    uint64_t v;
    __builtin_memcpy(&v, p, sizeof(v));
    return v;
}

/* Returns the station-name length and obtains its first eight bytes. */
static inline unsigned find_semicolon(const char *p, const char *simd_limit, uint64_t *word) {
    if (__builtin_expect(p <= simd_limit, 1)) {
        const __m128i semicolon = _mm_set1_epi8(';');
        __m128i block = _mm_loadu_si128((const __m128i *)p);
        *word = (uint64_t)_mm_cvtsi128_si64(block);
        unsigned mask = (unsigned)_mm_movemask_epi8(_mm_cmpeq_epi8(block, semicolon));
        if (__builtin_expect(mask != 0, 1)) return (unsigned)__builtin_ctz(mask);
        block = _mm_loadu_si128((const __m128i *)(p + 16));
        mask = (unsigned)_mm_movemask_epi8(_mm_cmpeq_epi8(block, semicolon));
        return 16u + (unsigned)__builtin_ctz(mask);
    }
    *word = first_word(p);
    const char *q = p;
    while (*q != ';') ++q;
    return (unsigned)(q - p);
}

static inline unsigned station_id(uint64_t word, unsigned len) {
    uint64_t key = (word & prefix_masks[len < 6 ? len : 6]) | ((uint64_t)len << 48);
    return direct_slots[(key * DIRECT_HASH_MULTIPLIER) >> (64 - DIRECT_HASH_BITS)];
}

/* The input grammar has exactly one decimal digit.  This is branch-free for
   the independently random sign and one/two-digit magnitude. */
static inline int parse_temperature(const char *p, const char **next) {
    unsigned neg = (unsigned)(p[0] == '-');
    p += neg;
    int first = p[0] - '0';
    unsigned one_digit = (unsigned)(p[1] == '.');
    int single = first * 10 + (p[2] - '0');
    int dual = first * 100 + (p[1] - '0') * 10 + (p[3] - '0');
    int choose_single = -(int)one_digit;
    int value = (single & choose_single) | (dual & ~choose_single);
    *next = p + 5 - one_digit;
    int sign = -(int)neg;
    return (value ^ sign) - sign;
}

static void *process(void *arg) {
    Worker *w = (Worker *)arg;
    const char *p = w->begin;
    while (p < w->end) {
        uint64_t word;
        unsigned len = find_semicolon(p, w->simd_limit, &word);
        unsigned id = station_id(word, len);
        const char *next;
        int temperature = parse_temperature(p + len + 1, &next);
        Stats *s = &w->stats[id];
        s->sum += temperature;
        s->count++;
        s->min = temperature < s->min ? temperature : s->min;
        s->max = temperature > s->max ? temperature : s->max;
        p = next;
    }
    return NULL;
}

static void initialize_stats(Stats *stats) {
    for (unsigned i = 0; i < STATION_COUNT; ++i) {
        stats[i].sum = 0;
        stats[i].count = 0;
        stats[i].min = INT16_MAX;
        stats[i].max = INT16_MIN;
    }
}

static char *append_uint(char *out, unsigned long long value) {
    char digits[24];
    char *p = digits + sizeof(digits);
    do {
        *--p = (char)('0' + value % 10);
        value /= 10;
    } while (value);
    while (p != digits + sizeof(digits)) *out++ = *p++;
    return out;
}

static char *append_temperature(char *out, int value) {
    if (value < 0) {
        *out++ = '-';
        value = -value;
    }
    out = append_uint(out, (unsigned)value / 10);
    *out++ = '.';
    *out++ = (char)('0' + (unsigned)value % 10);
    return out;
}

static void write_all(const char *p, size_t bytes) {
    while (bytes) {
        ssize_t n = write(STDOUT_FILENO, p, bytes);
        if (n <= 0) return;
        p += n;
        bytes -= (size_t)n;
    }
}

int main(int argc, char **argv) {
    if (argc != 2) return 2;
    int fd = open(argv[1], O_RDONLY);
    if (fd < 0) return 2;
    struct stat st;
    if (fstat(fd, &st)) {
        close(fd);
        return 2;
    }
    size_t size = (size_t)st.st_size;
    if (!size) {
        close(fd);
        write_all("{}", 2);
        return 0;
    }
    const char *data = mmap(NULL, size, PROT_READ, MAP_PRIVATE, fd, 0);
    close(fd);
    if (data == MAP_FAILED) return 2;

    Worker workers[THREADS];
    pthread_t threads[THREADS];
    const char *file_end = data + size;
    const char *simd_limit = size >= 32 ? file_end - 32 : data;
    for (unsigned i = 0; i < THREADS; ++i) {
        size_t start = size * i / THREADS;
        size_t end = size * (i + 1) / THREADS;
        if (i) while (start < size && data[start++] != '\n') {}
        workers[i].begin = data + start;
        workers[i].end = data + end;
        workers[i].simd_limit = simd_limit;
        initialize_stats(workers[i].stats);
        if (pthread_create(&threads[i], NULL, process, &workers[i])) {
            munmap((void *)data, size);
            return 2;
        }
    }
    for (unsigned i = 0; i < THREADS; ++i) pthread_join(threads[i], NULL);

    Stats total[STATION_COUNT];
    initialize_stats(total);
    for (unsigned worker = 0; worker < THREADS; ++worker) {
        for (unsigned city = 0; city < STATION_COUNT; ++city) {
            Stats *from = &workers[worker].stats[city];
            if (!from->count) continue;
            Stats *to = &total[city];
            to->sum += from->sum;
            to->count += from->count;
            to->min = from->min < to->min ? from->min : to->min;
            to->max = from->max > to->max ? from->max : to->max;
        }
    }

    char output[65536];
    char *out = output;
    *out++ = '{';
    unsigned emitted = 0;
    for (unsigned city = 0; city < STATION_COUNT; ++city) {
        Stats *s = &total[city];
        if (!s->count) continue;
        if (emitted++) {
            *out++ = ',';
            *out++ = ' ';
        }
        unsigned len = station_name_lens[city];
        memcpy(out, station_names[city], len);
        out += len;
        *out++ = '=';
        out = append_temperature(out, s->min);
        *out++ = '/';
        int mean = s->sum >= 0
            ? (int)((s->sum + (int64_t)s->count / 2) / (int64_t)s->count)
            : -(int)((-s->sum + (int64_t)s->count / 2) / (int64_t)s->count);
        out = append_temperature(out, mean);
        *out++ = '/';
        out = append_temperature(out, s->max);
    }
    *out++ = '}';
    write_all(output, (size_t)(out - output));
    munmap((void *)data, size);
    return 0;
}
