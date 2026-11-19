#!/bin/bash
cd "$(dirname "$0")" || exit 1
exec /usr/bin/python3 scripts/configure-ai.py
