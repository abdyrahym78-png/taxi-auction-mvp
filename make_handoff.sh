#!/bin/bash
echo "=== PROJECT STRUCTURE ===" > context_handoff.txt
tree -I 'node_modules|dist|.git' >> context_handoff.txt 2>/dev/null || ls -R -I 'node_modules|dist|.git' >> context_handoff.txt
echo -e "\n=== PACKAGE.JSON ===" >> context_handoff.txt
cat package.json >> context_handoff.txt
echo -e "\n=== SERVER.TS ===" >> context_handoff.txt
cat server.ts >> context_handoff.txt
echo -e "\n=== SRC/APP.TSX ===" >> context_handoff.txt
cat src/App.tsx >> context_handoff.txt
