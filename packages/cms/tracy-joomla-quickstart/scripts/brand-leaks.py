#!/usr/bin/env python3
"""Moved to scripts/brand-leaks.py at the repository root (25/09/2026): the same crawl is the
acceptance check of every CMS's quickstart, not Joomla's alone. Kept here so a command written
down before the move still runs — it runs the shared script with the same arguments."""
import os
import sys

here = os.path.dirname(os.path.abspath(__file__))
shared = os.path.normpath(os.path.join(here, "..", "..", "..", "..", "scripts", "brand-leaks.py"))
os.execv(sys.executable, [sys.executable, shared, *sys.argv[1:]])
