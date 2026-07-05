# PLAYRA — Mission-Based Gaming Network

> Don't ask *"what do you play?"* — ask *"what are you trying to accomplish tonight?"*

A cyberpunk-themed social platform prototype for gamers that matches players by **intent** — rank pushes, boss kills, raid groups, tournament rosters — instead of just game titles.

**Zero dependencies. One command to run: open `index.html` in a browser.**

## Features

- **Cinematic landing** — parallax neon skyline, particle field, scanline sweep, synthesized sound engine (Web Audio, no audio files, mute toggle included)
- **Gamer Card onboarding** — 3-step identity forge: callsign, avatar, games, voice languages, playstyle DNA, and goals
- **Command Center** — live radar canvas with sweeping blips, AI-matched teammate recommendations with compatibility scores, daily quests, squad presence
- **LFG Radar** — live posts with real ticking countdowns (critical state under 5 min), slot fills, game filters, and a broadcast composer
- **Mission Marketplace** — goal-based matchmaking cards with difficulty ratings and poster reputation
- **Discover Duos** — draggable swipe deck scoring schedule overlap, comms style, goal alignment, and vibe
- **Game Hubs** — 9 game worlds, each retuning the entire interface to its signal color
- **Tournament Hub** — prize pools, roster recruitment, one-tap registration
- **Living XP economy** — joins, ready checks, invites, and posts grant XP; quests complete; achievements unlock; level-up flashes fire
- **Squad Rooms** — temporary voice-armed rooms with animated ready checks before lobby handoff

## Structure

```
index.html      # markup: landing, app shell, 7 views, modals
css/styles.css  # full design system (tokens, glassmorphism, animations, responsive)
js/app.js       # state, sound engine, canvas radar/particles, swipe physics, XP system
```

## Tech

Vanilla HTML/CSS/JS. Canvas 2D for the radar and particles, Web Audio API for synthesized SFX, Pointer Events for swipe physics. Responsive down to mobile (bottom nav), respects `prefers-reduced-motion`.

## Roadmap

- Real backend (Next.js + PostgreSQL + Socket.IO) behind this UI
- Persistent accounts, real matchmaking engine, voice channels
- Clan systems, endorsement flows from completed sessions
