#define _GNU_SOURCE
#include <fcntl.h>
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

ALWAYS_INLINE uint64_t semi_mask(uint64_t v) {
    uint64_t x = v ^ 0x3B3B3B3B3B3B3B3BULL;
    return (x - 0x0101010101010101ULL) & ~x & 0x8080808080808080ULL;
}

ALWAYS_INLINE int parse_temp(const char *t, const char **after_nl) {
    int neg = (*t == '-');
    t += neg;
    int temp;
    if (t[1] == '.') {
        temp = (t[0] - '0') * 10 + (t[2] - '0');
        *after_nl = t + 4;
    } else {
        temp = (t[0] - '0') * 100 + (t[1] - '0') * 10 + (t[3] - '0');
        *after_nl = t + 5;
    }
    return neg ? -temp : temp;
}

static void process_range(Slot *table, const char **names, const char *p, const char *end) {
    (void)end;
    const char *stop = end;
    while (p < stop) {
        const char *name = p;
        uint64_t v = *(const uint64_t *)(const void *)p;
        uint64_t m = semi_mask(v);
        uint32_t len;
        uint64_t key;
        const char *s;
        if (LIKELY(m)) {
            uint32_t off = (uint32_t)(__builtin_ctzll(m) >> 3);
            len = off;
            key = v & MASK8[off];
            s = p + off;
        } else {
            key = v;
            p += 8;
            for (;;) {
                v = *(const uint64_t *)(const void *)p;
                m = semi_mask(v);
                if (m) {
                    uint32_t extra = (uint32_t)(__builtin_ctzll(m) >> 3);
                    len = (uint32_t)(p - name + extra);
                    key &= MASK8[len]; /* keep first 8; len>=8 so MASK all 1s */
                    s = p + extra;
                    break;
                }
                p += 8;
            }
        }
        const char *next;
        int temp = parse_temp(s + 1, &next);
        uint64_t id = key ^ ((uint64_t)len << 56);
        table_add(table, names, name, (uint16_t)len, id, temp);
        p = next;
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
    char *op = out;
    *op++ = '{';
    for (int i = 0; i < nitems; i++) {
        if (i) {
            *op++ = ',';
            *op++ = ' ';
        }
        memcpy(op, items[i].name, items[i].len);
        op += items[i].len;
        *op++ = '=';
        append_temp(&op, items[i].s->minv);
        *op++ = '/';
        append_temp(&op, round_mean(items[i].s->sum, items[i].s->count));
        *op++ = '/';
        append_temp(&op, items[i].s->maxv);
    }
    *op++ = '}';
    fwrite(out, 1, (size_t)(op - out), stdout);
    return 0;
}
