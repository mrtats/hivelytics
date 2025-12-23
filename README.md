# Hivelytics

A lean Hive stats viewer focused on core chain data. Select an RPC, enter an
account, and review balances, rewards, analytics, and charts.

## Features
- Account summary: HP, delegations, power down, RC, reputation
- Rewards overview: author, curation, witness totals and APR
- Pending rewards tables for author and curation
- Analytics for 7 or 30 days with charts

## Getting started

### Option A: Open directly
Open `index.html` in a modern browser. If you run into RPC or CORS issues,
use the local server below.

### Option B: Local server (recommended)
Serve the folder with any static file server, then open the local URL it
provides (for example, `http://localhost:8080`).

## Usage
1. Pick an RPC endpoint (or add a custom one).
2. Enter a Hive account name (without the `@`).
3. Click "Load account".

## Dependencies
- dhive (vendored as `dhive.js`)
- Chart.js (vendored as `chart.js`)

## License
See `LICENSE.md` for the project license and third-party licenses.
