#include <stdio.h>
#include "/work/submission/stations.h"
int main(){unsigned h=0x146d0ce0;unsigned idx=((h>>20)+mph_disp[h&255])&1023;printf("d%u idx%u id%u\n",mph_disp[h&255],idx,mph_ids[idx]);}
