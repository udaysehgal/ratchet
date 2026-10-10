import { getPresetPreviews } from '../src/server/meteora';
getPresetPreviews().then((ps) => {
  for (const p of ps) {
    const { points, ...rest } = p;
    console.log(JSON.stringify(rest));
    console.log('  curve:', [0, 12, 24, 36, 48].map((i) => `${points[i]!.raisedSol.toFixed(3)} SOL→${points[i]!.mcapSol.toFixed(2)}`).join(' | '));
  }
});
