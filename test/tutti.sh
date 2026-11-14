#!/bin/bash
# Esegue la build e tutti i test. Uso: bash test/tutti.sh
cd "$(dirname "$0")/.." && node build.mjs > /dev/null || exit 1
ok=0; ko=0; sk=0
for t in e2e sync studio fase4 versatile f1 f2 f3 ripianifica simulazioni deboli chiusura freddo studiaora domande carte generatore vetro spiegazioni quizapp editor generatori regole secondo aigen appunti; do
  out=$(python3 test/$t.py 2>&1)
  if echo "$out" | grep -q "TUTTO OK"; then echo "  ok  $t"; ok=$((ok+1))
  elif echo "$out" | grep -q "^SALTATO"; then echo " skip $t ($(echo "$out" | grep -m1 '^SALTATO'))"; sk=$((sk+1))
  else echo " FAIL $t"; ko=$((ko+1)); fi
done
echo "$ok ok, $ko falliti, $sk saltati"; [ $ko -eq 0 ]
