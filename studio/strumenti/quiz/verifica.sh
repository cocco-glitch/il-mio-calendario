#!/bin/bash
# Uso: ./verifica.sh esempio/meta.json [altri meta...]  -> deve stampare "TUTTO OK" e nessun WARN per ogni scheda
cd "$(dirname "$0")"; mkdir -p out/shots
for m in "$@"; do p=$(python3 build.py "$m" 2>/dev/null) || { echo "BUILD FALLITA $m"; continue; }
  echo "== $m"; python3 test_quiz.py "$p" out/shots 2>&1 | grep -E "WARN|errori|TUTTO|Error|assert|tipi|CON ERRORI"; done
