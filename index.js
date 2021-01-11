const { spawnSync } = require("child_process");
const path = require("path");
const crypto = require("crypto");
const fs = require("fs");

// (filename) => (hash) => output;
const cache = {};

module.exports = function styledJsxPostcssPlugin(
  css,
  settings = { cacheDir: null, cacheMem: false }
) {
  const {
    cacheDir,
    cacheMem,
    deasync,
    babel: _,
    ...processorOptions
  } = settings;
  let hash;
  if (cacheDir || cacheMem) {
    hash = crypto.createHash("md5").update(css).digest("hex");
  }

  // memcache
  let memCache;
  if (cacheMem) {
    if (settings.babel.filename in cache) {
      memCache = cache[settings.babel.filename];

      if (memCache && hash in memCache) {
        return memCache[hash];
      }
    } else {
      memCache = cache[settings.babel.filename] = {};
    }
  }

  // filecache
  let cacheFile;
  if (cacheDir) {
    cacheFile = path.join(cacheDir, hash);

    if (!fs.existsSync(cacheDir)) {
      fs.mkdir(cacheDir, () => {});
    } else if (fs.existsSync(cacheFile)) {
      return fs.readFileSync(cacheFile, "utf8");
    }
  }

  const cssWithPlaceholders = css.replace(
    /%%styled-jsx-placeholder-(\d+)%%/g,
    (_, id) => `/*%%styled-jsx-placeholder-${id}%%*/`
  );

  let output;
  if (deasync) {
    const deasyncPromise = require("deasync-promise");
    const { processor } = require("./processor");

    output = deasyncPromise(processor(cssWithPlaceholders, processorOptions));
  } else {
    const result = spawnSync(
      "node",
      [path.resolve(__dirname, "processor.js")],
      {
        input: JSON.stringify({
          css: cssWithPlaceholders,
          settings: processorOptions,
        }),
        encoding: "utf8",
      }
    );

    if (result.status !== 0) {
      if (result.stderr.includes("Invalid PostCSS Plugin")) {
        let isNext = false;
        try {
          require.resolve("next");
          isNext = true;
        } catch (err) {}
        if (isNext) {
          console.error(
            "Next.js 9 default postcss support uses a non standard postcss config schema https://err.sh/next.js/postcss-shape, you must use the interoperable object-based format instead https://nextjs.org/docs/advanced-features/customizing-postcss-config"
          );
        }
      }

      throw new Error(`postcss failed with ${result.stderr}`);
    }

    output = JSON.parse(result.stdout);
  }

  const { css: outputCss, maybeWarning } = output;

  if (maybeWarning) {
    console.warn(maybeWarning);
  }

  const pluginOutput = outputCss.replace(
    /\/\*%%styled-jsx-placeholder-(\d+)%%\*\//g,
    (_, id) => `%%styled-jsx-placeholder-${id}%%`
  );

  if (memCache) {
    if (Object.keys(memCache) > 5) {
      // clear the cache to prevent memory leak
      memCache = {};
    }
    memCache[hash] = pluginOutput;
  } else if (cacheFile) {
    fs.writeFileSync(cacheFile, pluginOutput);
  }

  return pluginOutput;
};
