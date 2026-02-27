# ConcessionQ - Arena Concession Heatmap

## Problem
Fans at Victoria Royals (WHL) games waste time in long concession lines. The arena wants to reduce wait times and increase revenue by helping fans find the least busy concession.

## Solution
A mobile-first web app showing a live heatmap of concession busyness. Fans scan a QR code on the jumbotron and see which stands are busy right now.

## Core Mechanic - Decaying Heat
- Each transaction at a location adds heat (+1 per item sold)
- Every 5 simulated minutes, all heat decays by 50%
- Heatmap color reflects current heat: green (quiet) -> yellow -> orange -> red (slammed)

## Architecture
- **Next.js** app, client-side only, no backend
- **Build-time script** converts CSV transaction data into per-game JSON files
- **Simulation engine** replays a past game's data at 30x speed in the browser
- **SVG arena schematic** with 6 concession nodes that change color based on heat

## Data
- 16 months of CSV transaction data (Sept 2024 - Feb 2026)
- Columns: Date, Time, Category, Item, Qty, Price Point Name, Location
- GameDetails.xlsx with game schedule and attendance figures
- 6 concession locations: Island Canteen, Island Slice, Phillips Bar, Portable Stations, ReMax Fan Deck, TacoTacoTaco

## Fan-Facing UI
- Single mobile-optimized page (portrait phone)
- SVG schematic of arena with ice rink center and 6 concession nodes
- Color scale: Green (#22c55e) -> Yellow (#eab308) -> Orange (#f97316) -> Red (#ef4444)
- Pulsing glow effect on nodes based on heat level

## Simulation
- Select a past game date to replay
- 30x speed compression (~2.5hr game in ~5 min)
- Decay tick every 5 simulated minutes (~10 real seconds at 30x)

## Future Ideas (Out of Scope)
- Live POS data integration (replace CSV replay with real-time webhook)
- Mobile ordering
- Incentives to redirect fans to quieter concessions
- Operator analytics dashboard

## Tech Stack
- Next.js + React
- Deploy to Vercel
