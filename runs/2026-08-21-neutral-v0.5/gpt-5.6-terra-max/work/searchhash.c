#include <stdint.h>
#include <stdio.h>
#include <string.h>
#include <stdlib.h>

static uint64_t rng = 0x5eeda11ce1234567ULL;
static uint64_t next_rng(void) {
    rng ^= rng << 7;
    rng ^= rng >> 9;
    return rng ^= rng << 8;
}
int main(void) {
    FILE *f = fopen("/work/stations.txt", "rb");
    char buf[128]; uint64_t keys[413]; int n=0;
    while (fgets(buf,sizeof buf,f)) {
        size_t len=strlen(buf); if (buf[len-1]=='\n') --len;
        uint64_t k=0; for (size_t i=0;i<len && i<6;i++) k|=(uint64_t)(unsigned char)buf[i]<<(i*8);
        keys[n++]=k|((uint64_t)len<<48);
    }
    uint32_t seen[1<<14]={0};
    for (int bits=13; bits<=15; bits++) {
        uint32_t epoch=0, mask=(1u<<bits)-1;
        uint64_t limit = bits==13 ? 5000000ULL : 1000000ULL;
        for (uint64_t trial=0;trial<limit;trial++) {
            uint64_t c=next_rng()|1;
            ++epoch;
            int i;
            for(i=0;i<n;i++) {
                unsigned q=(unsigned)(((keys[i]*c)>>(64-bits)) & mask);
                if(seen[q]==epoch) break;
                seen[q]=epoch;
            }
            if(i==n) {printf("bits=%d c=0x%016llx trial=%llu\n",bits,(unsigned long long)c,(unsigned long long)trial);return 0;}
        }
        printf("no result bits=%d after %llu\n",bits,(unsigned long long)limit);
    }
    return 1;
}
