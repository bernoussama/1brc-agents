#!/usr/bin/env bash

# Install the ordered DOCKER-USER policy for the internal agent network.
install_firewall_rules() {
  local proxy_ip="$1"
  local subnet="$2"
  local established_rule proxy_rule drop_rule

  established_rule=(-m conntrack --ctstate ESTABLISHED,RELATED -j ACCEPT)
  proxy_rule=(-s "$proxy_ip" -j ACCEPT)
  # The proxy source is accepted immediately above. A packet cannot have two
  # source selectors, so exclude the proxy by rule ordering rather than by
  # adding an invalid second -s/! -s pair.
  drop_rule=(-s "$subnet" ! -d "$proxy_ip" -j DROP)

  while iptables -C DOCKER-USER "${established_rule[@]}" 2>/dev/null; do
    iptables -D DOCKER-USER "${established_rule[@]}"
  done
  while iptables -C DOCKER-USER "${proxy_rule[@]}" 2>/dev/null; do
    iptables -D DOCKER-USER "${proxy_rule[@]}"
  done
  while iptables -C DOCKER-USER "${drop_rule[@]}" 2>/dev/null; do
    iptables -D DOCKER-USER "${drop_rule[@]}"
  done

  iptables -I DOCKER-USER 1 "${established_rule[@]}"
  iptables -I DOCKER-USER 2 "${proxy_rule[@]}"
  iptables -I DOCKER-USER 3 "${drop_rule[@]}"
}
