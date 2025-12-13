import { SugarEngine } from './core/Engine';

async function main() {
  const engine = new SugarEngine({
    container: document.getElementById('app')!,
    camera: {
      style: 'isometric',
      zoom: { min: 0.5, max: 2.0, default: 1.0 }
    }
  });

  // Load region and debug what's in it
  await engine.loadRegion('/regions/test/');

  engine.run();
}

main();
