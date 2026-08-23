#define _GNU_SOURCE
#include <fcntl.h>
#include <immintrin.h>
#include <nmmintrin.h>
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
#define TABLE_SIZE 2048
#endif
#define TABLE_MASK (TABLE_SIZE - 1)

#define ALWAYS_INLINE static inline __attribute__((always_inline, hot))
#define LIKELY(x) __builtin_expect(!!(x), 1)
#define UNLIKELY(x) __builtin_expect(!!(x), 0)

static const uint64_t MASK8[32] = {
    0x0000000000000000ULL, 0x00000000000000FFULL, 0x000000000000FFFFULL,
    0x0000000000FFFFFFULL, 0x00000000FFFFFFFFULL, 0x000000FFFFFFFFFFULL,
    0x0000FFFFFFFFFFFFULL, 0x00FFFFFFFFFFFFFFULL, 0xFFFFFFFFFFFFFFFFULL,
    0xFFFFFFFFFFFFFFFFULL, 0xFFFFFFFFFFFFFFFFULL, 0xFFFFFFFFFFFFFFFFULL,
    0xFFFFFFFFFFFFFFFFULL, 0xFFFFFFFFFFFFFFFFULL, 0xFFFFFFFFFFFFFFFFULL,
    0xFFFFFFFFFFFFFFFFULL, 0xFFFFFFFFFFFFFFFFULL, 0xFFFFFFFFFFFFFFFFULL,
    0xFFFFFFFFFFFFFFFFULL, 0xFFFFFFFFFFFFFFFFULL, 0xFFFFFFFFFFFFFFFFULL,
    0xFFFFFFFFFFFFFFFFULL, 0xFFFFFFFFFFFFFFFFULL, 0xFFFFFFFFFFFFFFFFULL,
    0xFFFFFFFFFFFFFFFFULL, 0xFFFFFFFFFFFFFFFFULL, 0xFFFFFFFFFFFFFFFFULL,
    0xFFFFFFFFFFFFFFFFULL, 0xFFFFFFFFFFFFFFFFULL, 0xFFFFFFFFFFFFFFFFULL,
    0xFFFFFFFFFFFFFFFFULL, 0xFFFFFFFFFFFFFFFFULL,
};

typedef struct {
    uint64_t id;
    int64_t sum;
    uint32_t count;
    int16_t minv;
    int16_t maxv;
    uint16_t len;
} Slot;

typedef struct {
    const char *start;
    const char *end;
    Slot *table;
    const char **names;
    int cpu;
} Worker;

ALWAYS_INLINE uint32_t hidx(uint64_t id) {
    return (uint32_t)_mm_crc32_u64(0, id) & TABLE_MASK;
}

ALWAYS_INLINE void table_add(Slot *table, const char **names, const char *name,
                             uint16_t len, uint64_t id, int temp) {
    uint32_t i = hidx(id);
    for (;;) {
        Slot *s = &table[i];
        if (LIKELY(s->id == id)) {
            s->sum += temp;
            s->count++;
            if (UNLIKELY(temp < s->minv)) s->minv = (int16_t)temp;
            if (UNLIKELY(temp > s->maxv)) s->maxv = (int16_t)temp;
            return;
        }
        if (s->count == 0) {
            s->id = id;
            s->sum = temp;
            s->minv = (int16_t)temp;
            s->maxv = (int16_t)temp;
            s->count = 1;
            s->len = len;
            names[i] = name;
            return;
        }
        i = (i + 1) & TABLE_MASK;
    }
}

ALWAYS_INLINE void parse_line(const char *ls, const char *nl, uint16_t *len, uint64_t *id, int *temp) {
    unsigned char c4 = (unsigned char)nl[-4];
    unsigned char c5 = (unsigned char)nl[-5];
    int has_tens = (unsigned)(c4 - '0') <= 9u;
    int is_neg = (c4 == '-') | (c5 == '-');
    int t = has_tens * (int)(c4 - '0') * 100 + (int)(nl[-3] - '0') * 10 + (int)(nl[-1] - '0');
    *temp = is_neg ? -t : t;
    uint32_t l = (uint32_t)((nl - 4 - has_tens - is_neg) - ls);
    *len = (uint16_t)l;
    uint64_t key = *(const uint64_t *)(const void *)ls & MASK8[l];
    *id = key ^ ((uint64_t)l << 56);
}

ALWAYS_INLINE void apply_one(Slot *table, const char **names, const char *ls, const char *nl) {
    uint16_t len;
    uint64_t id;
    int temp;
    parse_line(ls, nl, &len, &id, &temp);
    table_add(table, names, ls, len, id, temp);
}

static void process_range(Slot *table, const char **names, const char *p, const char *end) {
    const char *line_start = p;
    const __m256i vnl = _mm256_set1_epi8('\n');

    while (p + 64 <= end) {
        __m256i v0 = _mm256_loadu_si256((const __m256i *)(const void *)p);
        __m256i v1 = _mm256_loadu_si256((const __m256i *)(const void *)(p + 32));
        uint32_t m0 = (uint32_t)_mm256_movemask_epi8(_mm256_cmpeq_epi8(v0, vnl));
        uint32_t m1 = (uint32_t)_mm256_movemask_epi8(_mm256_cmpeq_epi8(v1, vnl));
        uint64_t mask = (uint64_t)m0 | ((uint64_t)m1 << 32);
        __builtin_prefetch(p + 512, 0, 0);

        if (LIKELY(mask)) {
            uint32_t b0 = (uint32_t)__builtin_ctzll(mask);
            const char *nl0 = p + b0;
            mask &= mask - 1;

            uint16_t len0;
            uint64_t id0;
            int temp0;
            parse_line(line_start, nl0, &len0, &id0, &temp0);
            __builtin_prefetch(&table[hidx(id0)], 1, 3);
            const char *name0 = line_start;
            line_start = nl0 + 1;

            while (mask) {
                uint32_t b1 = (uint32_t)__builtin_ctzll(mask);
                const char *nl1 = p + b1;
                mask &= mask - 1;
                uint16_t len1;
                uint64_t id1;
                int temp1;
                parse_line(line_start, nl1, &len1, &id1, &temp1);
                __builtin_prefetch(&table[hidx(id1)], 1, 3);
                table_add(table, names, name0, len0, id0, temp0);
                name0 = line_start;
                len0 = len1;
                id0 = id1;
                temp0 = temp1;
                line_start = nl1 + 1;
            }
            table_add(table, names, name0, len0, id0, temp0);
        }
        p += 64;
    }
    while (p + 32 <= end) {
        __m256i v0 = _mm256_loadu_si256((const __m256i *)(const void *)p);
        uint32_t mask = (uint32_t)_mm256_movemask_epi8(_mm256_cmpeq_epi8(v0, vnl));
        while (mask) {
            uint32_t bit = (uint32_t)__builtin_ctz(mask);
            const char *nl = p + bit;
            apply_one(table, names, line_start, nl);
            line_start = nl + 1;
            mask &= mask - 1;
        }
        p += 32;
    }
    while (p < end) {
        if (*p == '\n') {
            apply_one(table, names, line_start, p);
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
    process_range(w->table, w->names, w->start, w->end);
    return NULL;
}

static int slot_cmp(const void *a, const void *b) {
    const Slot *sa = *(const Slot *const *)a;
    const Slot *sb = *(const Slot *const *)b;
    const char *na = (const char *)((const Slot *const *)a)[2];
    (void)na;
    return 0;
}

typedef struct {
    const char *name;
    uint16_t len;
    const Slot *s;
} Item;

static int item_cmp(const void *a, const void *b) {
    const Item *ia = (const Item *)a;
    const Item *ib = (const Item *)b;
    uint32_t ml = ia->len < ib->len ? ia->len : ib->len;
    int c = memcmp(ia->name, ib->name, ml);
    if (c) return c;
    return (int)ia->len - (int)ib->len;
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

static void merge_slot(Slot *dst, const char **dstn, const Slot *s, const char *name) {
    uint32_t i = hidx(s->id);
    for (;;) {
        Slot *d = &dst[i];
        if (d->count == 0) {
            *d = *s;
            dstn[i] = name;
            return;
        }
        if (d->id == s->id) {
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
    (void)slot_cmp;
    if (argc != 2) {
        fprintf(stderr, "usage: %s <file>\n", argv[0]);
        return 1;
    }

    int fd = open(argv[1], O_RDONLY);
    if (fd < 0) {
        perror("open");
        return 1;
    }
    posix_fadvise(fd, 0, 0, POSIX_FADV_SEQUENTIAL | POSIX_FADV_WILLNEED);
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
    madvise(data, size, MADV_SEQUENTIAL);

    int nthreads = NTHREADS;
    if ((size_t)nthreads > size) nthreads = 1;

    Slot *tables = aligned_alloc(64, (size_t)nthreads * TABLE_SIZE * sizeof(Slot));
    const char **allnames = aligned_alloc(64, (size_t)nthreads * TABLE_SIZE * sizeof(char *));
    if (!tables || !allnames) return 1;
    memset(tables, 0, (size_t)nthreads * TABLE_SIZE * sizeof(Slot));
    memset(allnames, 0, (size_t)nthreads * TABLE_SIZE * sizeof(char *));

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
        workers[i].names = allnames + (size_t)i * TABLE_SIZE;
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
    const char **accn = workers[0].names;
    for (int i = 1; i < nthreads; i++) {
        for (int j = 0; j < TABLE_SIZE; j++) {
            if (workers[i].table[j].count)
                merge_slot(acc, accn, &workers[i].table[j], workers[i].names[j]);
        }
    }

    Item items[512];
    int nitems = 0;
    for (int i = 0; i < TABLE_SIZE; i++) {
        if (acc[i].count) {
            items[nitems].name = accn[i];
            items[nitems].len = acc[i].len;
            items[nitems].s = &acc[i];
            nitems++;
        }
    }
    qsort(items, (size_t)nitems, sizeof(Item), item_cmp);

    char *out = malloc(256 * 1024);
    if (!out) return 1;
    char *p = out;
    *p++ = '{';
    for (int i = 0; i < nitems; i++) {
        if (i) {
            *p++ = ',';
            *p++ = ' ';
        }
        memcpy(p, items[i].name, items[i].len);
        p += items[i].len;
        *p++ = '=';
        append_temp(&p, items[i].s->minv);
        *p++ = '/';
        append_temp(&p, round_mean(items[i].s->sum, items[i].s->count));
        *p++ = '/';
        append_temp(&p, items[i].s->maxv);
    }
    *p++ = '}';
    fwrite(out, 1, (size_t)(p - out), stdout);
    return 0;
}
