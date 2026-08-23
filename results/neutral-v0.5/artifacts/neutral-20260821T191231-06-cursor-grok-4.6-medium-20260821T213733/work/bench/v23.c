#define _GNU_SOURCE
#include <fcntl.h>
#include <immintrin.h>
#include <pthread.h>
#include <sched.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/mman.h>
#include <sys/stat.h>
#include <unistd.h>

#ifndef NTHREADS
#define NTHREADS 6
#endif

#ifndef TABLE_SIZE
#define TABLE_SIZE 4096
#endif
#define TABLE_MASK (TABLE_SIZE - 1)

#define ALWAYS_INLINE static inline __attribute__((always_inline, hot))
#define LIKELY(x) __builtin_expect(!!(x), 1)

static const uint64_t MASK8[27] = {
    0x0000000000000000ULL, 0x00000000000000FFULL, 0x000000000000FFFFULL,
    0x0000000000FFFFFFULL, 0x00000000FFFFFFFFULL, 0x000000FFFFFFFFFFULL,
    0x0000FFFFFFFFFFFFULL, 0x00FFFFFFFFFFFFFFULL, 0xFFFFFFFFFFFFFFFFULL,
    0xFFFFFFFFFFFFFFFFULL, 0xFFFFFFFFFFFFFFFFULL, 0xFFFFFFFFFFFFFFFFULL,
    0xFFFFFFFFFFFFFFFFULL, 0xFFFFFFFFFFFFFFFFULL, 0xFFFFFFFFFFFFFFFFULL,
    0xFFFFFFFFFFFFFFFFULL, 0xFFFFFFFFFFFFFFFFULL, 0xFFFFFFFFFFFFFFFFULL,
    0xFFFFFFFFFFFFFFFFULL, 0xFFFFFFFFFFFFFFFFULL, 0xFFFFFFFFFFFFFFFFULL,
    0xFFFFFFFFFFFFFFFFULL, 0xFFFFFFFFFFFFFFFFULL, 0xFFFFFFFFFFFFFFFFULL,
    0xFFFFFFFFFFFFFFFFULL, 0xFFFFFFFFFFFFFFFFULL, 0xFFFFFFFFFFFFFFFFULL,
};

typedef struct {
    uint64_t key;
    int64_t sum;
    uint32_t count;
    uint16_t len;
    int16_t minv;
    int16_t maxv;
    const char *name;
} Slot;

typedef struct {
    const char *start;
    const char *end;
    Slot *table;
    int cpu;
} Worker;

ALWAYS_INLINE uint32_t hidx(uint64_t key, uint32_t len) {
    uint64_t x = (key ^ ((uint64_t)len * 0x9E3779B97F4A7C15ULL)) * 0xBF58476D1CE4E5B9ULL;
    x ^= x >> 32;
    return (uint32_t)x;
}

ALWAYS_INLINE void table_add(Slot *table, const char *name, uint32_t len, uint64_t key, int temp) {
    uint32_t i = hidx(key, len) & TABLE_MASK;
    for (;;) {
        Slot *s = &table[i];
        if (LIKELY(s->key == key && s->len == (uint16_t)len)) {
            s->minv = temp < s->minv ? (int16_t)temp : s->minv;
            s->maxv = temp > s->maxv ? (int16_t)temp : s->maxv;
            s->sum += temp;
            s->count++;
            return;
        }
        if (s->count != 0) {
            i = (i + 1) & TABLE_MASK;
            continue;
        }
        s->key = key;
        s->sum = temp;
        s->minv = (int16_t)temp;
        s->maxv = (int16_t)temp;
        s->count = 1;
        s->len = (uint16_t)len;
        s->name = name;
        return;
    }
}

ALWAYS_INLINE void process_line(Slot *table, const char *line_start, const char *nl) {
    unsigned char c4 = (unsigned char)nl[-4];
    unsigned char c5 = (unsigned char)nl[-5];
    int has_tens = (unsigned)(c4 - '0') <= 9u;
    int is_neg = (c4 == '-') | (c5 == '-');
    int tens = has_tens * (int)(c4 - '0');
    int temp = tens * 100 + (int)(nl[-3] - '0') * 10 + (int)(nl[-1] - '0');
    temp = is_neg ? -temp : temp;
    const char *semi = nl - 4 - has_tens - is_neg;
    uint32_t len = (uint32_t)(semi - line_start);
    uint64_t key = *(const uint64_t *)(const void *)line_start & MASK8[len];
    table_add(table, line_start, len, key, temp);
}

static void process_range(Slot *table, const char *p, const char *end) {
    const char *line_start = p;
    const __m256i vnl = _mm256_set1_epi8('\n');

    while (p + 64 <= end) {
        __m256i v0 = _mm256_loadu_si256((const __m256i *)(const void *)p);
        __m256i v1 = _mm256_loadu_si256((const __m256i *)(const void *)(p + 32));
        uint32_t m0 = (uint32_t)_mm256_movemask_epi8(_mm256_cmpeq_epi8(v0, vnl));
        uint32_t m1 = (uint32_t)_mm256_movemask_epi8(_mm256_cmpeq_epi8(v1, vnl));
        uint64_t mask = (uint64_t)m0 | ((uint64_t)m1 << 32);
        __builtin_prefetch(p + 256, 0, 0);
        while (mask) {
            uint32_t bit = (uint32_t)__builtin_ctzll(mask);
            const char *nl = p + bit;
            mask &= mask - 1;
            process_line(table, line_start, nl);
            line_start = nl + 1;
        }
        p += 64;
    }
    while (p + 32 <= end) {
        __m256i v0 = _mm256_loadu_si256((const __m256i *)(const void *)p);
        uint32_t mask = (uint32_t)_mm256_movemask_epi8(_mm256_cmpeq_epi8(v0, vnl));
        while (mask) {
            uint32_t bit = (uint32_t)__builtin_ctz(mask);
            const char *nl = p + bit;
            process_line(table, line_start, nl);
            line_start = nl + 1;
            mask &= mask - 1;
        }
        p += 32;
    }
    while (p < end) {
        if (*p == '\n') {
            process_line(table, line_start, p);
            line_start = p + 1;
        }
        p++;
    }
}

static void pin_cpu(int cpu) {
    cpu_set_t set;
    CPU_ZERO(&set);
    CPU_SET(cpu, &set);
    sched_setaffinity(0, sizeof(set), &set);
}

static void *worker_fn(void *arg) {
    Worker *w = (Worker *)arg;
    pin_cpu(w->cpu);
    process_range(w->table, w->start, w->end);
    return NULL;
}

static int slot_cmp(const void *a, const void *b) {
    const Slot *sa = *(const Slot *const *)a;
    const Slot *sb = *(const Slot *const *)b;
    uint32_t ml = sa->len < sb->len ? sa->len : sb->len;
    int c = memcmp(sa->name, sb->name, ml);
    if (c) return c;
    return (int)sa->len - (int)sb->len;
}

static int round_mean(int64_t sum, uint32_t count) {
    int64_t cnt = (int64_t)count;
    int64_t q = sum / cnt;
    int64_t r = sum % cnt;
    if (r < 0) {
        if ((-r) * 2 >= cnt) q--;
    } else {
        if (r * 2 >= cnt) q++;
    }
    return (int)q;
}

static void append_temp(char **pp, int t) {
    char *p = *pp;
    if (t < 0) {
        *p++ = '-';
        t = -t;
    }
    if (t >= 100) {
        *p++ = (char)('0' + t / 100);
        t %= 100;
    }
    *p++ = (char)('0' + t / 10);
    *p++ = '.';
    *p++ = (char)('0' + t % 10);
    *pp = p;
}

static void merge_slot(Slot *dst, const Slot *s) {
    uint32_t i = hidx(s->key, s->len) & TABLE_MASK;
    for (;;) {
        Slot *d = &dst[i];
        if (d->count == 0) {
            *d = *s;
            return;
        }
        if (d->key == s->key && d->len == s->len) {
            d->minv = s->minv < d->minv ? s->minv : d->minv;
            d->maxv = s->maxv > d->maxv ? s->maxv : d->maxv;
            d->sum += s->sum;
            d->count += s->count;
            return;
        }
        i = (i + 1) & TABLE_MASK;
    }
}

int main(int argc, char **argv) {
    if (argc != 2) {
        fprintf(stderr, "usage: %s <file>\n", argv[0]);
        return 1;
    }

    int fd = open(argv[1], O_RDONLY);
    if (fd < 0) {
        perror("open");
        return 1;
    }
    struct stat st;
    if (fstat(fd, &st) != 0) {
        perror("fstat");
        return 1;
    }
    size_t size = (size_t)st.st_size;
    if (size == 0) {
        fputs("{}", stdout);
        return 0;
    }

    size_t page = (size_t)sysconf(_SC_PAGESIZE);
    size_t map_len = (size + page * 2 + page - 1) & ~(page - 1);
    char *anon = mmap(NULL, map_len, PROT_READ | PROT_WRITE, MAP_PRIVATE | MAP_ANONYMOUS, -1, 0);
    if (anon == MAP_FAILED) {
        perror("mmap anon");
        return 1;
    }
    char *data = mmap(anon, size, PROT_READ, MAP_SHARED | MAP_FIXED, fd, 0);
    if (data == MAP_FAILED) {
        perror("mmap file");
        return 1;
    }
    madvise(data, size, MADV_HUGEPAGE);

    int nthreads = NTHREADS;
    if ((size_t)nthreads > size) nthreads = 1;

    Slot *tables = aligned_alloc(64, (size_t)nthreads * TABLE_SIZE * sizeof(Slot));
    if (!tables) return 1;
    memset(tables, 0, (size_t)nthreads * TABLE_SIZE * sizeof(Slot));

    Worker workers[16];
    pthread_t tids[16];
    size_t chunk = size / (size_t)nthreads;

    for (int i = 0; i < nthreads; i++) {
        size_t start = (size_t)i * chunk;
        size_t end = (i == nthreads - 1) ? size : (size_t)(i + 1) * chunk;
        if (i > 0) {
            while (start < size && data[start - 1] != '\n') start++;
        }
        if (i < nthreads - 1) {
            while (end < size && data[end - 1] != '\n') end++;
        }
        workers[i].start = data + start;
        workers[i].end = data + end;
        workers[i].table = tables + (size_t)i * TABLE_SIZE;
        workers[i].cpu = i;
    }

    for (int i = 1; i < nthreads; i++) {
        pthread_create(&tids[i], NULL, worker_fn, &workers[i]);
    }
    worker_fn(&workers[0]);
    for (int i = 1; i < nthreads; i++) {
        pthread_join(tids[i], NULL);
    }

    Slot *acc = workers[0].table;
    for (int i = 1; i < nthreads; i++) {
        for (int j = 0; j < TABLE_SIZE; j++) {
            if (workers[i].table[j].count) merge_slot(acc, &workers[i].table[j]);
        }
    }

    Slot *items[512];
    int nitems = 0;
    for (int i = 0; i < TABLE_SIZE; i++) {
        if (acc[i].count) items[nitems++] = &acc[i];
    }
    qsort(items, (size_t)nitems, sizeof(Slot *), slot_cmp);

    char *out = malloc(256 * 1024);
    if (!out) return 1;
    char *p = out;
    *p++ = '{';
    for (int i = 0; i < nitems; i++) {
        if (i) {
            *p++ = ',';
            *p++ = ' ';
        }
        memcpy(p, items[i]->name, items[i]->len);
        p += items[i]->len;
        *p++ = '=';
        append_temp(&p, items[i]->minv);
        *p++ = '/';
        append_temp(&p, round_mean(items[i]->sum, items[i]->count));
        *p++ = '/';
        append_temp(&p, items[i]->maxv);
    }
    *p++ = '}';
    fwrite(out, 1, (size_t)(p - out), stdout);
    return 0;
}
