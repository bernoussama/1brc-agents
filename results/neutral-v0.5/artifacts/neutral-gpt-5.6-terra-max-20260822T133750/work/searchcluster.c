#include <stdint.h>
#include <stdio.h>
#include <string.h>
static uint64_t rng=0xa9d831e42b756c0fULL;
static uint64_t rnd(void){rng^=rng<<7;rng^=rng>>9;return rng^=rng<<8;}
int main(){FILE*f=fopen("/work/stations.txt","rb");char b[128];uint64_t k[413];int n=0;
while(fgets(b,sizeof b,f)){size_t l=strlen(b);if(b[l-1]=='\n')--l;uint64_t x=0;for(size_t j=0;j<l&&j<6;j++)x|=(uint64_t)(unsigned char)b[j]<<(8*j);k[n++]=x|((uint64_t)l<<48);}
uint32_t seen[8192]={0},epoch=0;int best=999, found=0;
for(uint64_t t=0;t<7000000;t++){uint64_t c=rnd()|1;++epoch;int i;uint64_t lines[4]={0};for(i=0;i<n;i++){unsigned q=(unsigned)(k[i]*c>>51);if(seen[q]==epoch)break;seen[q]=epoch;lines[q>>11]|=1ULL<<((q>>5)&63);}if(i==n){int nl=__builtin_popcountll(lines[0])+__builtin_popcountll(lines[1])+__builtin_popcountll(lines[2])+__builtin_popcountll(lines[3]);found++;if(nl<best){best=nl;printf("best lines=%d c=0x%016llx trial=%llu found=%d\n",best,(unsigned long long)c,(unsigned long long)t,found);fflush(stdout);}}}
}
