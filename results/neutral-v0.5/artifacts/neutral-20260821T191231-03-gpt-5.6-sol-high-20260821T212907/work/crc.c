#include <stdio.h>
#include <string.h>
#include <stdint.h>
#include <nmmintrin.h>
int main(){char*s="Petropavlovsk-Kamchatsky";unsigned n=strlen(s),l=0;uint64_t h=0;while(l<n){uint64_t w=0;memcpy(&w,s+l,n-l>8?8:n-l);h=_mm_crc32_u64(h,w);l+=n-l>8?8:n-l;}printf("%x n%u\n",(unsigned)h^n,n);}
