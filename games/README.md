# Game Projects

Each game lives in its own project folder under `games/<slug>/`.

Expected structure:
- `project.sgrgame` authored game data
- `assets/` project-owned runtime assets (regions/models/audio/images)
- `config/game.config.json` game identity + content base + deploy defaults

Use `GAME_SLUG=<slug>` with build/export scripts.
Or set a workspace default with `npm run game:use -- <slug>`.

Source-of-truth authored data belongs in `games/<slug>/` (not `public/`).
