import { build } from "esbuild";

await build({
  entryPoints: ["edge-src/index.ts"],
  bundle: true,
  format: "esm",
  platform: "neutral",
  outfile: "supabase/functions/duel/index.ts",
  plugins: [
    {
      name: "supabase-npm",
      setup(result) {
        result.onResolve({ filter: /^@supabase\/supabase-js$/ }, () => ({
          path: "npm:@supabase/supabase-js@2.49.8",
          external: true,
        }));
      },
    },
  ],
});
